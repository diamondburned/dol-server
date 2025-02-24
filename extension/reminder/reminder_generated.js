// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

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
$(document).on(":passagerender", (event)=>{
    console.log("(3) changed passage to", event);
});
document.addEventListener(":passagerender", (event)=>{
    console.log("(1) changed passage to", event);
});
document.addEventListener("passagerender", (event)=>{
    console.log("(2) changed passage to", event);
});
