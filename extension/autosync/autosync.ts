import sugarcube from "https://esm.sh/v133/@types/twine-sugarcube@2.36.7";

declare global {
  interface Window {
    SugarCube: sugarcube.SugarCubeObject | undefined;
  }
}

// Block until #story is loaded.
if (document.getElementById("story") === null) {
  await new Promise<void>((resolve) => {
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

if (!window.SugarCube) {
  alert("SugarCube not found after loading #story");
}

const SugarCube = window.SugarCube;

type MergeResult =
  | {
    result: "ok";
    data: {
      changed: boolean;
    };
  }
  | {
    result: "error";
    data: {
      error: string;
    };
  }
  | {
    result: "outdated";
    data: MergeData;
  };

type MergeData = {
  date: number;
  data: string | null;
};

async function sync(date: number, shouldMerge = true) {
  console.debug("autosync: syncing", new Date(date));

  const save = SugarCube.Save.serialize();
  if (save == null) {
    return;
  }

  const resp = await fetch("/x/autosync/merge", {
    method: "POST",
    body: JSON.stringify({
      date,
      data: save,
    } as MergeData),
  });

  const body = await resp.json() as MergeResult;
  switch (body.result) {
    case "ok": {
      break;
    }
    case "error": {
      throw new Error(body.data.error);
    }
    case "outdated": {
      if (!shouldMerge) {
        await promptAlert(removeIndentation(`
          Your save is outdated.
          Please manually load the latest save.
        `));
        break;
      }

      const override = await promptOverride();
      if (override) {
        SugarCube.Save.deserialize(body.data.data);
        SugarCube.Save.autosave.load();
      }

      break;
    }
  }
}

// checkSync checks if the current save is outdated and prompts the user to
// override their save with a newer save from the server if it is.
async function checkSync() {
  const autosave = SugarCube.Save.autosave.get();
  const date = autosave?.date;

  const resp = await fetch("/x/autosync/merge");
  const body = await resp.json() as MergeData;

  if (date != null && date > body.date) {
    return;
  }

  // The server save is newer than the current save or there is no current save.
  SugarCube.Save.deserialize(body.data);
  SugarCube.Save.autosave.load();
}

// promptAlert prompts the user with an alert dialog. It blocks until the user
// closes the prompt.
function promptAlert(msg: string): Promise<void> {
  return new Promise<void>((resolve) => {
    SugarCube.UI.alert(msg, null, resolve);
  });
}

// promptOverride prompts the user to override their save with a newer save
// from the server. It blocks until the user closes the prompt and returns
// whether the user chose to override their save.
function promptOverride(): Promise<boolean> {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;

  const label = document.createElement("label");
  label.appendChild(checkbox);
  label.appendChild(
    document.createTextNode("Override after closing this dialog"),
  );

  return new Promise<boolean>((resolve) => {
    SugarCube.Dialog.setup("Autosave", "autosync-prompt-override");
    SugarCube.Dialog.append(removeIndentation(`
      Your save is outdated.
      Would you like to override your save with the server save?
    `));
    SugarCube.Dialog.append(document.createElement("br"));
    SugarCube.Dialog.append(label);
    SugarCube.Dialog.open(null, () => resolve(checkbox.checked));
  });
}

function removeIndentation(str: string) {
  str = str.replace(/^\s+/g, "");
  str = str.replace(/\s+$/g, "");
  str = str.replace(/\n+/g, " ");
  return str;
}

let saving = false;
let saveLaterDate: number | null = null;

function saveHook(save: sugarcube.SaveObject) {
  console.debug("autosync: saving");
  saveLaterDate = save.date;

  if (saving) {
    // Delay saving until the current save is done.
    console.debug("autosync: delaying save until current save is done");
    return;
  }

  (async function () {
    while (saveLaterDate != null) {
      saving = true;

      // saveLaterDate may change while we're syncing, so save it now.
      // We will recheck it after syncing.
      const saveDate = saveLaterDate;
      saveLaterDate = null;

      try {
        await sync(saveDate);
      } catch (err) {
        await promptAlert("Error syncing save: " + err);
        break;
      } finally {
        saving = false;
      }
    }
  })();
}

// Autosave every passage change. Best if "Preserve history when refreshing a
// page" is false.
//
// Disabling this because it causes large performance issues on every scene
// change, probably due to how the game is structured.

// SugarCube.Config.saves.autosave = true;

(async function () {
  // Trigger the sync right now to get the latest save.
  // Wait until the overriden save is loaded before registering the autosave
  // hook and checking for outdated saves.
  await checkSync();

  // Register the save hook.
  SugarCube.Save.onSave.add(saveHook);

  // Autosave every 15 seconds in addition to passage changes.
  setInterval(() => SugarCube.Save.autosave.save(), 15000);
})();
