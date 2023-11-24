import sugarcube from "https://esm.sh/v133/@types/twine-sugarcube@2.36.7";
export { SugarCube as TwineSugarCube };

type PassageEvent = {
  content: HTMLElement;
  passage: TwineSugarCube.Passage;
};

interface SugarCubeEvents {
  ":passageinit": Pick<PassageEvent, "passage">;
  ":passagestart": PassageEvent;
  ":passagerender": PassageEvent;
  ":passagedisplay": PassageEvent;
  ":passageend": PassageEvent;
}

declare global {
  interface Document {
    addEventListener<K extends keyof SugarCubeEvents>(
      type: K,
      listener: (this: Document, ev: SugarCubeEvents[K]) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
    dispatchEvent<K extends keyof SugarCubeEvents>(
      event: SugarCubeEvents[K],
    ): boolean;
  }
  interface Window {
    SugarCube: sugarcube.SugarCubeObject | undefined;
    sugarCubeInitPromise: Promise<void> | undefined;
  }
}

if (!window.sugarCubeInitPromise) {
  window.sugarCubeInitPromise = new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      const story = document.getElementById("story");
      if (story !== null) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true });
  });
}

export async function waitForSugarCube(): Promise<sugarcube.SugarCubeObject> {
  // Block until #story is loaded.
  await window.sugarCubeInitPromise;
  if (!window.SugarCube) {
    alert("SugarCube not found after loading #story");
  }
  return window.SugarCube;
}
