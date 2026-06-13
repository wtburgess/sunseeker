import { Icon } from "./Icon";

/** Gedeelde bovenbalk met het SUNSEEKER-merk. */
export function TopAppBar() {
  return (
    <header className="sticky top-0 z-50 w-full bg-surface/90 backdrop-blur-sm border-b-2 border-outline-variant">
      <div className="flex justify-center items-center gap-2 w-full px-container-margin py-base max-w-7xl mx-auto h-16">
        <Icon name="explore" className="text-primary text-headline-md" />
        <h1 className="font-headline-lg text-headline-lg uppercase tracking-wider text-primary">
          Sunseeker
        </h1>
      </div>
    </header>
  );
}
