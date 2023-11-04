import sugarcube from "https://esm.sh/v133/@types/twine-sugarcube@2.36.7";

declare global {
  interface Window {
    SugarCube: sugarcube.SugarCubeObject | undefined;
  }
}

const initPromise = new Promise<void>((resolve) => {
  const observer = new MutationObserver(() => {
    const story = document.getElementById("story");
    if (story !== null) {
      observer.disconnect();
      resolve();
    }
  });
  observer.observe(document.body, { childList: true });
});

export async function waitForSugarCube(): Promise<sugarcube.SugarCubeObject> {
  // Block until #story is loaded.
  await initPromise;
  if (!window.SugarCube) {
    alert("SugarCube not found after loading #story");
  }
  return window.SugarCube;
}
