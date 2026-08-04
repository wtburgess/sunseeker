import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface MinutelyPoint {
  time: string;
  minute: number;
  precip: number;
}

interface MinutelyData {
  nextHour: MinutelyPoint[];
  nextHours: Array<{ time: string; hoursAhead: number; precip: number }>;
  hasBuienradar?: boolean; // true if BUIENRADAR data is available
}

/**
 * BUIENRADAR 5-minute precipitation nowcast
 * Uses the public BUIENRADAR API (no authentication required)
 * Returns precipitation in mm/hour for next 2 hours at 5-minute resolution
 *
 * Note: KNMI EDR API alternative available if you register for a key:
 * Email opendata@knmi.nl to request access (takes ~2 working days)
 */
async function fetchBuienradarNowcast(
  lat: number,
  lon: number
): Promise<MinutelyData | null> {
  try {
    // BUIENRADAR public API - no key required
    // Note: trailing slash required, coordinates rounded to 2 decimals
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const response = await fetch(
      `https://gpsgadget.buienradar.nl/data/raintext/?lat=${roundedLat}&lon=${roundedLon}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      console.debug(`[Buienradar] API error: ${response.status}`);
      return null;
    }

    const text = await response.text();
    const buienradarData = parseBuienradarResponse(text);
    return buienradarData;
  } catch (err) {
    console.debug("[Buienradar] Fetch failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

function parseBuienradarResponse(text: string): MinutelyData | null {
  try {
    // BUIENRADAR format: lines of "time|precipitation_mm_per_hour"
    // Example: "2026-08-04T20:00:00|0.3"
    // Data is 5-minute intervals for 120 minutes
    const lines = text.trim().split("\n").filter(line => line.length > 0);
    if (lines.length === 0) return null;

    const now = new Date();
    const nextHour: MinutelyPoint[] = [];
    const nextHours: Array<{ time: string; hoursAhead: number; precip: number }> = [];
    const hourlyTotals: Map<number, { sum: number; count: number; time: string }> = new Map();

    lines.forEach((line: string) => {
      const [precipStr, timeStr] = line.split("|");
      if (!precipStr || !timeStr) return;

      // BUIENRADAR format: precipitation is in 0-255 scale (0=dry, 255=heavy rain)
      // Convert to mm/hour: roughly 0-200 maps to 0-100mm/hr
      const precipValue = parseInt(precipStr.trim(), 10) || 0;
      const precip = (precipValue / 2.55); // Scale to mm/hour

      // Parse time: BUIENRADAR gives HH:MM in local time, build today's date
      const [hours, mins] = timeStr.trim().split(":");
      const time = new Date(now);
      time.setHours(parseInt(hours, 10), parseInt(mins, 10), 0, 0);

      // Check if this timestamp makes sense (not too far in future)
      const minutesAhead = Math.round((time.getTime() - now.getTime()) / 60000);
      if (minutesAhead < 0 || minutesAhead > 125) return;

      const isoTime = time.toISOString().slice(0, 16);
      const hoursAhead = Math.round(minutesAhead / 60);

      // First 2 hours: 5-minute resolution (BUIENRADAR nowcast)
      if (minutesAhead <= 120) {
        nextHour.push({
          time: isoTime,
          minute: Math.max(0, minutesAhead),
          precip: precip / 12, // Convert mm/hour → mm/5min
        });
      }

      // Aggregate hourly data (average intensity over the hour)
      // All hours for BUIENRADAR (will be extended with Open-Meteo fallback later)
      if (hoursAhead > 0 && hoursAhead <= 8) {
        if (!hourlyTotals.has(hoursAhead)) {
          hourlyTotals.set(hoursAhead, { sum: 0, count: 0, time: isoTime });
        }
        const hourData = hourlyTotals.get(hoursAhead)!;
        hourData.sum += precip;
        hourData.count += 1;
      }
    });

    // Convert hourly aggregates to array
    const hourlyArray: Array<{ time: string; hoursAhead: number; precip: number }> = [];
    hourlyTotals.forEach((data, hoursAhead) => {
      const avgPrecip = data.count > 0 ? data.sum / data.count : 0;
      hourlyArray.push({
        time: data.time,
        hoursAhead,
        precip: avgPrecip,
      });
    });
    hourlyArray.sort((a, b) => a.hoursAhead - b.hoursAhead);

    return {
      nextHour: nextHour.slice(0, 24), // 5-min points for ~120 min (BUIENRADAR coverage)
      nextHours: hourlyArray.slice(0, 8), // Up to 8 hourly points
    };
  } catch (err) {
    console.debug("[Buienradar] Parse error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function GET(req: NextRequest) {
  const latStr = req.nextUrl.searchParams.get("lat");
  const lonStr = req.nextUrl.searchParams.get("lon");

  if (!latStr || !lonStr) {
    return NextResponse.json({ error: "Missing lat/lon" }, { status: 400 });
  }

  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);

  // Try BUIENRADAR first (public, no key required)
  const buienradarData = await fetchBuienradarNowcast(lat, lon);
  if (buienradarData) {
    // Fetch Open-Meteo data to extend forecast beyond 2 hours
    const openMeteoUrl = new URL("https://api.open-meteo.com/v1/forecast");
    openMeteoUrl.searchParams.set("latitude", lat.toString());
    openMeteoUrl.searchParams.set("longitude", lon.toString());
    openMeteoUrl.searchParams.set("hourly", "precipitation");
    openMeteoUrl.searchParams.set("timezone", "auto");
    openMeteoUrl.searchParams.set("forecast_hours", "8");

    try {
      const omRes = await fetch(openMeteoUrl.toString(), { signal: AbortSignal.timeout(5000) });
      if (omRes.ok) {
        const omData = await omRes.json();

        if (omData.hourly?.precipitation && omData.hourly?.time) {
          // Map Open-Meteo times to hoursAhead relative to now
          const now = new Date();
          const nowHours = Math.floor(now.getTime() / 3600000); // Hours since epoch

          const omHourly = omData.hourly.precipitation
            .map((precip: number, idx: number) => {
              const timeStr = omData.hourly.time[idx];
              const pointTime = new Date(timeStr);
              const pointHours = Math.floor(pointTime.getTime() / 3600000);
              const hoursAhead = pointHours - nowHours;

              return {
                time: timeStr.slice(0, 16), // ISO format without seconds
                hoursAhead,
                precip,
              };
            })
            .filter((h) => h.hoursAhead > 0 && h.hoursAhead <= 8);

          if (omHourly.length > 0) {
            // Merge: BUIENRADAR for minutely, blend hourly data (prefer BUIENRADAR for 1-2, Open-Meteo for 3-8)
            const buienradarHours = buienradarData.nextHours.filter((h) => h.hoursAhead >= 1 && h.hoursAhead <= 2);
            const openMeteoHours = omHourly.filter((h) => h.hoursAhead >= 3);

            // Fill any gaps in hourly data
            const allHours = [...buienradarHours, ...openMeteoHours].sort((a, b) => a.hoursAhead - b.hoursAhead);

            return NextResponse.json({
              nextHour: buienradarData.nextHour,
              nextHours: allHours,
              hasBuienradar: true,
            });
          }
        }
      }
    } catch (err) {
      // Silently fail and return BUIENRADAR data only
    }

    return NextResponse.json({
      ...buienradarData,
      hasBuienradar: true,
    });
  }

  // Fallback for non-BUIENRADAR regions: fetch Open-Meteo 15-minute data
  try {
    const openMeteoUrl = new URL("https://api.open-meteo.com/v1/forecast");
    openMeteoUrl.searchParams.set("latitude", lat.toString());
    openMeteoUrl.searchParams.set("longitude", lon.toString());
    openMeteoUrl.searchParams.set("minutely_15", "precipitation");
    openMeteoUrl.searchParams.set("timezone", "auto");
    openMeteoUrl.searchParams.set("forecast_minutes", "120");

    const omRes = await fetch(openMeteoUrl.toString(), { signal: AbortSignal.timeout(5000) });
    if (omRes.ok) {
      const omData = await omRes.json();

      if (omData.minutely_15?.precipitation && omData.minutely_15?.time) {
        const now = new Date();
        const nowMinutes = Math.floor(now.getTime() / 60000);

        // Convert Open-Meteo 15-minute data to our format
        const minutelyData: MinutelyPoint[] = omData.minutely_15.time
          .map((timeStr: string, idx: number) => {
            const pointTime = new Date(timeStr);
            const pointMinutes = Math.floor(pointTime.getTime() / 60000);
            const minutesAhead = pointMinutes - nowMinutes;

            return {
              time: pointTime.toISOString().slice(0, 16),
              minute: minutesAhead,
              precip: (omData.minutely_15.precipitation[idx] || 0) / 4, // Convert mm/hour to mm/15min
            };
          })
          .filter((m) => m.minute >= 0 && m.minute <= 120);

        // Also get hourly data for hours 2-8
        const hourlyUrl = new URL("https://api.open-meteo.com/v1/forecast");
        hourlyUrl.searchParams.set("latitude", lat.toString());
        hourlyUrl.searchParams.set("longitude", lon.toString());
        hourlyUrl.searchParams.set("hourly", "precipitation");
        hourlyUrl.searchParams.set("timezone", "auto");
        hourlyUrl.searchParams.set("forecast_hours", "8");

        const hourRes = await fetch(hourlyUrl.toString(), { signal: AbortSignal.timeout(5000) });
        if (hourRes.ok) {
          const hourData = await hourRes.json();

          if (hourData.hourly?.precipitation && hourData.hourly?.time) {
            const omTimes = hourData.hourly.time;
            const hourlyData = hourData.hourly.precipitation
              .map((precip: number, idx: number) => {
                const timeStr = omTimes[idx];
                const pointTime = new Date(timeStr);
                const pointHours = Math.floor(pointTime.getTime() / 3600000);
                const hoursAhead = pointHours - Math.floor(now.getTime() / 3600000);

                return {
                  time: timeStr.slice(0, 16),
                  hoursAhead,
                  precip,
                };
              })
              .filter((h) => h.hoursAhead >= 2 && h.hoursAhead <= 8);

            return NextResponse.json({
              nextHour: minutelyData.slice(0, 8), // ~2 hours of 15-min data
              nextHours: hourlyData,
              hasBuienradar: false,
            });
          }
        }
      }
    }
  } catch (err) {
    // Fall through to 501
  }

  // Final fallback: return 501 so the client fetches from Open-Meteo
  return NextResponse.json(
    { error: "5-minute nowcast unavailable, falling back to Open-Meteo" },
    { status: 501 }
  );
}
