import * as autosaveToast from "#/extension/autosync/autosync_toast.ts";
import { onSaveListReveal } from "#/extension/autosync/autosync_toast.ts";
import { waitForSugarCube } from "#/lib/sugarcube.ts";
import { html } from "https://deno.land/x/html@v1.2.0/mod.ts";

const SugarCube = await waitForSugarCube();

type MergeResult = MergeOK | MergeError | MergeConflict;

type MergeOK = {
  result: "ok";
  data: {
    consistent: boolean;
    hash: string;
  };
};

type MergeError = {
  result: "error";
  data: {
    error: string;
  };
};

type MergeConflict = {
  result: "conflict";
  data: {
    save: SaveData | null;
    server_hash?: string;
  };
};

type SaveData = {
  data: string | null;
  date: number;
};

// lastDataHash is initialized by checkSync and is used to determine if the
// current save is outdated. It is maintained by sync.
let lastHash: string | null = null;

function overrideLocal(data: string, hash: string) {
  lastHash = hash;
  SugarCube.Save.deserialize(data);
}

async function sync() {
  console.debug("autosync: syncing");

  const data = SugarCube.Save.serialize();
  if (data == null) {
    return;
  }

  const resp = await fetch("/x/autosync/merge", {
    method: "POST",
    body: JSON.stringify({
      data,
      last_hash: lastHash,
    }),
  });

  const body = await resp.json() as MergeResult;
  switch (body.result) {
    case "ok": {
      lastHash = body.data.hash;
      break;
    }
    case "error": {
      throw new Error(body.data.error);
    }
    case "conflict": {
      await handleOverride(data, body.data.save, body.data.server_hash);
      break;
    }
  }
}

// checkSync checks if the current save is outdated and prompts the user to
// override their save with a newer save from the server if it is.
async function checkSync() {
  const autosave = SugarCube.Save.autosave.get();
  if (autosave && SugarCube.Config.saves.isAllowed()) {
    // Local also has a save. Try to do an actual sync.
    await sync();
    return;
  }

  const resp = await fetch("/x/autosync/save");
  const body = await resp.json() as {
    save: SaveData | null;
    server_hash?: string;
  };
  if (body.save == null) {
    // Opportunistically sync if the server has no save.
    if (SugarCube.Config.saves.isAllowed()) {
      await sync();
    }
    return;
  }

  // Server has a save, but local does not. Override local with server.
  overrideLocal(body.save.data, body.server_hash!);
}

// promptAlert prompts the user with an alert dialog. It blocks until the user
// closes the prompt.
function promptAlert(msg: string): Promise<void> {
  return new Promise<void>((resolve) => {
    SugarCube.UI.alert(msg, null, resolve);
  });
}

// handleOverride takes care of calling promptOverride and handling the user's
// choice.
async function handleOverride(
  clientData: string,
  serverSave: SaveData,
  serverHash: string,
) {
  const override = await promptOverride(serverSave.date);
  switch (override) {
    case OverrideChoice.Local: {
      overrideLocal(serverSave.data, serverHash);
      break;
    }
    case OverrideChoice.Server: {
      const resp = await fetch("/x/autosync/merge?override=1", {
        method: "POST",
        body: JSON.stringify({
          data: clientData,
        }),
      });

      const body = await resp.json() as MergeResult;
      if (body.result != "ok") {
        throw new Error("failed to override save");
      }

      lastHash = body.data.hash;
      break;
    }
  }
}

enum OverrideChoice {
  Local, // override local save with server save
  Server, // override server save with local save
}

// promptOverride prompts the user to override their save with a newer save
// from the server. It blocks until the user closes the prompt and returns
// whether the user chose to override their save.
function promptOverride(
  serverDate: number | null = null,
): Promise<OverrideChoice> {
  const div = document.createElement("div");
  div.classList.add("autosync-prompt-override");

  if (serverDate != null) {
    const serverDateString = new Date(serverDate).toLocaleString();
    const info = document.createElement("div");
    info.classList.add("autosync-prompt-override-info");
    info.innerHTML = html`
      <span>Server save date: ${serverDateString}</span>
    `;
    div.append(info);
  }

  const form = document.createElement("form");
  form.innerHTML = html`
    <label>
      <input type="radio" name="override" value="local" checked>
      Override with server save
    </label>
    <br />
    <label>
      <input type="radio" name="override" value="server">
      Override with local save
    </label>
  `;
  div.append(form);

  return new Promise<OverrideChoice>((resolve) => {
    SugarCube.Dialog.setup("Autosave", "autosync-prompt-override");
    SugarCube.Dialog.append(removeIndentation(`
      Your local save is outdated.
      Would you like to override it with the server save?
    `));
    SugarCube.Dialog.append(document.createElement("br"));
    SugarCube.Dialog.append(form);
    SugarCube.Dialog.open(null, () => {
      const formData = new FormData(form);
      const override = formData.get("override") as string;
      switch (override) {
        case "local":
          resolve(OverrideChoice.Local);
          break;
        case "server":
          resolve(OverrideChoice.Server);
          break;
      }
    });
  });
}

function removeIndentation(str: string) {
  str = str.replace(/^\s+/g, "");
  str = str.replace(/\s+$/g, "");
  str = str.replace(/\n+/g, " ");
  return str;
}

let saving = false;

async function saveHook() {
  if (saving) {
    // Delay saving until the current save is done.
    console.debug("autosync: delaying save until current save is done");
    return;
  }

  console.debug("autosync: saving");
  saving = true;

  try {
    await sync();
    autosaveToast.notifySaved();
  } catch (err) {
    autosaveToast.notifyError(err);
  } finally {
    saving = false;
  }
}

// Trigger the sync right now to get the latest save.
// Wait until the overriden save is loaded before registering the autosave
// hook and checking for outdated saves.
try {
  await checkSync();
  autosaveToast.notifySaved("Save has been restored!");
} catch (err) {
  autosaveToast.notifyError(err);
}

// Register the save hook, but don't return the Promise so that the save hook
// can finish before the Promise resolves.
SugarCube.Save.onSave.add(() => {
  saveHook();
});

// Autosave when the user opens the save dialog.
onSaveListReveal((saveListReveal) => {
  if (saveListReveal) {
    console.debug("autosync: save dialog opened, autosaving...");
    SugarCube.Save.autosave.save();
  }
});

// Autosave every minute in addition to the dialog autosave.
setInterval(() => SugarCube.Save.autosave.save(), 15000);
