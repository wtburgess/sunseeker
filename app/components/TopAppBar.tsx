import { Icon } from "./Icon";

/** Gedeelde bovenbalk met het SUNSEEKER-merk, een weerpraatje- en legenda-knop. */
export function TopAppBar({
  onInfo,
  onStory,
}: {
  onInfo?: () => void;
  onStory?: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-50 w-full bg-surface/90 backdrop-blur-sm border-b-2 border-outline-variant"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="relative flex justify-center items-center gap-2 w-full px-container-margin py-base max-w-7xl mx-auto h-16">
        {onStory && (
          <button
            onClick={onStory}
            aria-label="Weerpraatje voor deze plaats"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-primary hover:bg-surface-container-high active-press"
          >
            <Icon name="chat_bubble" className="text-[26px]" />
          </button>
        )}
        <Icon
          name="explore"
          className="text-primary text-headline-md animate-compass-in"
        />
        <h1 className="font-headline-lg text-headline-lg uppercase tracking-wider text-primary">
          Sunseeker
        </h1>
        {onInfo && (
          <button
            onClick={onInfo}
            aria-label="Legenda: wat betekenen de iconen?"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-primary hover:bg-surface-container-high active-press"
          >
            <Icon name="info" className="text-[26px]" />
          </button>
        )}
      </div>
    </header>
  );
}
