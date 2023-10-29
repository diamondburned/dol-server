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
async function sync(date, shouldMerge = true) {
    console.debug("autosync: syncing", new Date(date));
    const save = SugarCube.Save.serialize();
    if (save == null) {
        return;
    }
    const resp = await fetch("/x/autosync/merge", {
        method: "POST",
        body: JSON.stringify({
            date,
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
                throw new Error(body.data.error);
            }
        case "outdated":
            {
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
async function checkSync() {
    const autosave = SugarCube.Save.autosave.get();
    const date = autosave?.date;
    const resp = await fetch("/x/autosync/merge");
    const body = await resp.json();
    if (date != null && date > body.date) {
        return;
    }
    SugarCube.Save.deserialize(body.data);
    SugarCube.Save.autosave.load();
}
function promptAlert(msg) {
    return new Promise((resolve)=>{
        SugarCube.UI.alert(msg, null, resolve);
    });
}
function promptOverride() {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    const label = document.createElement("label");
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode("Override after closing this dialog"));
    return new Promise((resolve)=>{
        SugarCube.Dialog.setup("Autosave", "autosync-prompt-override");
        SugarCube.Dialog.append(removeIndentation(`
      Your save is outdated.
      Would you like to override your save with the server save?
    `));
        SugarCube.Dialog.append(document.createElement("br"));
        SugarCube.Dialog.append(label);
        SugarCube.Dialog.open(null, ()=>resolve(checkbox.checked));
    });
}
function removeIndentation(str) {
    str = str.replace(/^\s+/g, "");
    str = str.replace(/\s+$/g, "");
    str = str.replace(/\n+/g, " ");
    return str;
}
let saving = false;
let saveLaterDate = null;
function saveHook(save) {
    console.debug("autosync: saving");
    saveLaterDate = save.date;
    if (saving) {
        console.debug("autosync: delaying save until current save is done");
        return;
    }
    (async function() {
        while(saveLaterDate != null){
            saving = true;
            const saveDate = saveLaterDate;
            saveLaterDate = null;
            try {
                await sync(saveDate);
            } catch (err) {
                await promptAlert("Error syncing save: " + err);
                break;
            } finally{
                saving = false;
            }
        }
    })();
}
(async function() {
    await checkSync();
    SugarCube.Save.onSave.add(saveHook);
    setInterval(()=>SugarCube.Save.autosave.save(), 15000);
})();
