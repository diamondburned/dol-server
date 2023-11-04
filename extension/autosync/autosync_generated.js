// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

function html(strings, ...values) {
    const parts = [
        strings[0]
    ];
    for(let i = 0; i < values.length; i++){
        parts.push(String(values[i]));
        parts.push(strings[i + 1]);
    }
    return parts.join("");
}
const initPromise = new Promise((resolve)=>{
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
async function waitForSugarCube() {
    await initPromise;
    if (!window.SugarCube) {
        alert("SugarCube not found after loading #story");
    }
    return window.SugarCube;
}
await waitForSugarCube();
const toast = document.createElement("div");
toast.classList.add("autosave-toast");
const story = document.getElementById("story");
function updateToastPosition(saveListVisible) {
    const customOverlayContent = document.getElementById("customOverlayContent");
    if (saveListVisible) {
        if (toast.parentElement == story) {
            toast.removeAttribute("style");
            toast.style.display = "inline-block";
            story.removeChild(toast);
        }
        if (toast.parentElement != customOverlayContent) {
            customOverlayContent.prepend(toast);
        }
    } else {
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
const saveListHandlers = [
    updateToastPosition
];
function onSaveListReveal(handler) {
    saveListHandlers.push(handler);
}
function saveListIsVisible() {
    const customOverlay = document.getElementById("customOverlayContainer");
    const saveList = document.getElementById("saveList");
    return true && !!saveList && !!customOverlay && !customOverlay.classList.contains("hidden");
}
let saveListWasVisible = false;
function dispatchSaveListHandlers() {
    const saveListVisible = saveListIsVisible();
    if (saveListVisible != saveListWasVisible) {
        saveListWasVisible = saveListVisible;
        saveListHandlers.forEach((handler)=>handler(saveListVisible));
    }
}
const storyObserver = new MutationObserver(()=>dispatchSaveListHandlers());
storyObserver.observe(story, {
    subtree: true,
    attributeFilter: [
        "class"
    ]
});
dispatchSaveListHandlers();
let timeout = null;
let killedExportWarning = false;
function showFor(duration, html) {
    show(html);
    timeout = setTimeout(()=>clear(), duration);
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
function show(html) {
    clear();
    toast.innerHTML = html;
    toast.classList.remove("hidden");
    updateToastPosition(saveListIsVisible());
    const exportWarning = document.getElementById("export-warning");
    if (exportWarning && !exportWarning.classList.contains("hidden")) {
        exportWarning.classList.add("hidden");
        killedExportWarning = true;
    }
}
function notifySaved(message = "Save has been synchronized!") {
    showFor(5000, html`<span class="green">${message}</span>`);
}
function notifyError(error) {
    show(html`<mouse class="tooltip red">Error occured while synchronizing!<span>${error}</span></mouse>`);
}
clear();
const SugarCube = await waitForSugarCube();
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
async function saveHook(save) {
    saveLaterDate = save.date;
    if (saving) {
        console.debug("autosync: delaying save until current save is done");
        return;
    }
    console.debug("autosync: saving");
    while(saveLaterDate != null){
        saving = true;
        const saveDate = saveLaterDate;
        saveLaterDate = null;
        try {
            await sync(saveDate);
            notifySaved();
        } catch (err) {
            notifyError(err);
        } finally{
            saving = false;
        }
    }
}
try {
    await checkSync();
    notifySaved("Save has been restored!");
} catch (err) {
    notifyError(err);
}
SugarCube.Save.onSave.add((save)=>{
    saveHook(save);
});
onSaveListReveal((saveListReveal)=>{
    if (saveListReveal) {
        console.debug("autosync: save dialog opened, autosaving...");
        SugarCube.Save.autosave.save();
    }
});
setInterval(()=>SugarCube.Save.autosave.save(), 15000);
