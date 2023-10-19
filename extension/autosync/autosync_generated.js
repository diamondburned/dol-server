// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

if (document.getElementById("story") === null) {
    await new Promise((resolve)=>{
        const observer = new MutationObserver(()=>{
            const story = document.getElementById("story");
            if (story !== null) {
                observer.disconnect();
                resolve();
            }
        });
        observer.observe(document.body, {
            childList: true
        });
    });
}
if (!window.SugarCube) {
    alert("SugarCube not found after loading #story");
}
const SugarCube = window.SugarCube;
function canSave() {
    return SugarCube.Save.ok() && (!SugarCube.Config.saves.isAllowed || SugarCube.Config.saves.isAllowed());
}
function lastEventTimestamp() {
    const history = SugarCube.State["history"];
    if (!history) return null;
    const lastEvent = history.last();
    const timestamp = lastEvent?.variables?.["timeStamp"];
    if (!timestamp) return null;
    return timestamp;
}
async function sync() {
    if (SugarCube.State.active.title == "Start") {
        const resp = await fetch("/x/autosync/merge");
        const body = await resp.json();
        if (body.data == null) return;
        const localTimestamp = lastEventTimestamp();
        if (!localTimestamp || localTimestamp < body.date) {
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
            data: save
        })
    });
    const body = await resp.json();
    switch(body.result){
        case "ok":
            {
                break;
            }
        case "error":
            {
                SugarCube.UI.alert(body.data.error);
                break;
            }
        case "outdated":
            {
                SugarCube.Save.deserialize(body.data.data);
                await notifyOverwrite();
                break;
            }
    }
}
async function notifyOverwrite() {
    await new Promise((resolve)=>{
        SugarCube.UI.alert(removeIndentation(`
        Overwrote current saves with server saves.
        Please manually load the latest save.
      `), null, ()=>resolve());
    });
}
function removeIndentation(str) {
    str = str.replace(/^\s+/g, "");
    str = str.replace(/\s+$/g, "");
    str = str.replace(/\n+/g, " ");
    return str;
}
const schedule = async ()=>{
    await sync();
    setTimeout(schedule, 5000);
};
schedule();
