import { html } from "https://deno.land/x/html@v1.2.0/mod.ts";
import { waitForSugarCube } from "#/lib/sugarcube.ts";

// This also waits for #story to load.
await waitForSugarCube();

const toast = document.createElement("div");
toast.classList.add("autosave-toast");

const story = document.getElementById("story");

// updateToastPosition updates where the autosave toast is placed depending on
// whether the save list is visible or not. If the save list is visible, the
// autosave toast is placed at the top of the save list. Otherwise, it is placed
// at the top of the story.
function updateToastPosition(saveListVisible: boolean) {
  const customOverlayContent = document.getElementById("customOverlayContent");

  if (saveListVisible) {
    // Steal the autosave state element from the save list.
    if (toast.parentElement == story) {
      toast.removeAttribute("style");
      toast.style.display = "inline-block";

      story.removeChild(toast);
    }

    if (toast.parentElement != customOverlayContent) {
      customOverlayContent.prepend(toast);
    }
  } else {
    // Return the autosave state element to the story.
    if (customOverlayContent && toast.parentElement == customOverlayContent) {
      customOverlayContent.removeChild(toast);
    }

    if (!story.contains(toast)) {
      toast.removeAttribute("style");
      toast.style.position = "fixed";
      toast.style.fontSize = "0.9em";
      toast.style.top = "0";

      story.append(toast);
    }
  }
}

const saveListHandlers: Array<(saveListVisible: boolean) => void> = [
  updateToastPosition,
];

// onSaveListReveal registers a handler that is called when the save list is
// revealed or hidden.
export function onSaveListReveal(handler: (saveListVisible: boolean) => void) {
  saveListHandlers.push(handler);
}

// saveListIsVisible returns whether the save list is visible or not.
export function saveListIsVisible(): boolean {
  const customOverlay = document.getElementById("customOverlayContainer");
  const saveList = document.getElementById("saveList");

  return true &&
    !!saveList &&
    !!customOverlay &&
    !customOverlay.classList.contains("hidden");
}

let saveListWasVisible = false;

function dispatchSaveListHandlers() {
  const saveListVisible = saveListIsVisible();
  if (saveListVisible != saveListWasVisible) {
    saveListWasVisible = saveListVisible;
    saveListHandlers.forEach((handler) => handler(saveListVisible));
  }
}

const storyObserver = new MutationObserver(() => dispatchSaveListHandlers());
storyObserver.observe(story, {
  subtree: true,
  attributeFilter: ["class"],
});

dispatchSaveListHandlers();

let timeout: number | null = null;
let killedExportWarning = false;

function showFor(duration: number, html: string) {
  show(html);
  timeout = setTimeout(() => clear(), duration);
}

function clear() {
  toast.innerHTML = "";
  toast.classList.add("hidden");

  if (timeout != null) {
    clearTimeout(timeout);
  }

  if (killedExportWarning) {
    const exportWarning = document.getElementById("export-warning");
    if (exportWarning) {
      exportWarning.classList.remove("hidden");
      killedExportWarning = false;
    }
  }
}

function show(html: string) {
  clear();
  toast.innerHTML = html;
  toast.classList.remove("hidden");
  updateToastPosition(saveListIsVisible());

  // Hide this thing just in case.
  const exportWarning = document.getElementById("export-warning");
  if (exportWarning && !exportWarning.classList.contains("hidden")) {
    exportWarning.classList.add("hidden");
    killedExportWarning = true;
  }
}

// notifySaved shows a notification that the save has been synchronized.
export function notifySaved(message = "Save has been synchronized!") {
  showFor(
    5000,
    html`<span class="green">${message}</span>`,
  );
}

// notifyError shows a notification that an error has occured.
export function notifyError(error: string) {
  show(
    html`<mouse class="tooltip red">Error occured while synchronizing!<span>${error}</span></mouse>`,
  );
}

clear();
