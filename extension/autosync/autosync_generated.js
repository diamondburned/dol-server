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
if (!window.sugarCubeInitPromise) {
    window.sugarCubeInitPromise = new Promise((resolve)=>{
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
async function waitForSugarCube() {
    await window.sugarCubeInitPromise;
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
let lastHash = null;
function overrideLocal(data, hash) {
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
            last_hash: lastHash
        })
    });
    const body = await resp.json();
    switch(body.result){
        case "ok":
            {
                lastHash = body.data.hash;
                break;
            }
        case "error":
            {
                throw new Error(body.data.error);
            }
        case "conflict":
            {
                await handleOverride(data, body.data.save, body.data.server_hash);
                break;
            }
    }
}
async function checkSync() {
    const autosave = SugarCube.Save.autosave.get();
    if (autosave && SugarCube.Config.saves.isAllowed()) {
        await sync();
        return;
    }
    const resp = await fetch("/x/autosync/save");
    const body = await resp.json();
    if (body.save == null) {
        if (SugarCube.Config.saves.isAllowed()) {
            await sync();
        }
        return;
    }
    overrideLocal(body.save.data, body.server_hash);
}
async function handleOverride(clientData, serverSave, serverHash) {
    const override = await promptOverride(serverSave.date);
    switch(override){
        case OverrideChoice.Local:
            {
                overrideLocal(serverSave.data, serverHash);
                break;
            }
        case OverrideChoice.Server:
            {
                const resp = await fetch("/x/autosync/merge?override=1", {
                    method: "POST",
                    body: JSON.stringify({
                        data: clientData
                    })
                });
                const body = await resp.json();
                if (body.result != "ok") {
                    throw new Error("failed to override save");
                }
                lastHash = body.data.hash;
                break;
            }
    }
}
var OverrideChoice;
(function(OverrideChoice) {
    OverrideChoice[OverrideChoice["Local"] = 0] = "Local";
    OverrideChoice[OverrideChoice["Server"] = 1] = "Server";
})(OverrideChoice || (OverrideChoice = {}));
function promptOverride(serverDate = null) {
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
    return new Promise((resolve)=>{
        SugarCube.Dialog.setup("Autosave", "autosync-prompt-override");
        SugarCube.Dialog.append(removeIndentation(`
      Your local save is outdated.
      Would you like to override it with the server save?
    `));
        SugarCube.Dialog.append(document.createElement("br"));
        SugarCube.Dialog.append(form);
        SugarCube.Dialog.open(null, ()=>{
            const formData = new FormData(form);
            const override = formData.get("override");
            switch(override){
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
function removeIndentation(str) {
    str = str.replace(/^\s+/g, "");
    str = str.replace(/\s+$/g, "");
    str = str.replace(/\n+/g, " ");
    return str;
}
let saving = false;
async function saveHook() {
    if (saving) {
        console.debug("autosync: delaying save until current save is done");
        return;
    }
    console.debug("autosync: saving");
    saving = true;
    try {
        await sync();
        notifySaved();
    } catch (err) {
        notifyError(err);
    } finally{
        saving = false;
    }
}
try {
    await checkSync();
    notifySaved("Save has been restored!");
} catch (err) {
    notifyError(err);
}
SugarCube.Save.onSave.add(()=>{
    saveHook();
});
onSaveListReveal((saveListReveal)=>{
    if (saveListReveal) {
        console.debug("autosync: save dialog opened, autosaving...");
        SugarCube.Save.autosave.save();
    }
});
setInterval(()=>SugarCube.Save.autosave.save(), 15000);
