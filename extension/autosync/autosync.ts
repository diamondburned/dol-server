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

function canSave(): boolean {
  return SugarCube.Save.ok() &&
    (!SugarCube.Config.saves.isAllowed || SugarCube.Config.saves.isAllowed());
}

// lastEventTimestamp returns the timestamp of the last event in the history
// stack. If there is no history, or the last event has no timestamp, it returns
// null.
function lastEventTimestamp(): number | null {
  const history = SugarCube.State["history"];
  if (!history) return null;

  const lastEvent = history.last();

  const timestamp = lastEvent?.variables?.["timeStamp"];
  if (!timestamp) return null;

  return timestamp;
}

async function sync() {
  if (SugarCube.State.active.title == "Start") {
    // We can't serialize saves from the start screen.
    // Try to just restore the save from the server.
    const resp = await fetch("/x/autosync/merge");
    const body = await resp.json() as MergeData;
    if (body.data == null) return;

    const localTimestamp = lastEventTimestamp();
    if (!localTimestamp || localTimestamp < body.date) {
      // If the server save is newer, overwrite the current save.
      SugarCube.Save.deserialize(body.data);
      await notifyOverwrite();
    }

    return;
  }

  if (!canSave()) {
    return;
  }

  const localTimestamp = lastEventTimestamp();
  if (!localTimestamp) {
    // Cannot save. Make no effort to sync.
    return;
  }

  const save = SugarCube.Save.serialize();
  if (save == null) {
    return;
  }

  const resp = await fetch("/x/autosync/merge", {
    method: "POST",
    body: JSON.stringify({
      date: localTimestamp,
      data: save,
    } as MergeData),
  });

  const body = await resp.json() as MergeResult;
  switch (body.result) {
    case "ok": {
      break;
    }
    case "error": {
      SugarCube.UI.alert(body.data.error);
      break;
    }
    case "outdated": {
      SugarCube.Save.deserialize(body.data.data);
      await notifyOverwrite();
      break;
    }
  }
}

// notifyOverwrite notifies the user that their save was overwritten by a newer
// save from the server. It blocks until the user clicks OK.
async function notifyOverwrite() {
  await new Promise<void>((resolve) => {
    SugarCube.UI.alert(
      removeIndentation(`
        Overwrote current saves with server saves.
        Please manually load the latest save.
      `),
      null,
      () => resolve(),
    );
  });
}

function removeIndentation(str: string) {
  str = str.replace(/^\s+/g, "");
  str = str.replace(/\s+$/g, "");
  str = str.replace(/\n+/g, " ");
  return str;
}

const syncInterval = 5000;

const schedule = async () => {
  await sync();
  // Reschedule the next sync.
  setTimeout(schedule, syncInterval);
};
schedule();
