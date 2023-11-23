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
const updates = [
    {
        selector: `[data-overlay="journal"] ul li`,
        update: (listItems)=>{
            listItems.forEach((li)=>{
                li.innerHTML = li.textContent.replaceAll(/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|today|tomorrow|in \d* days|\d{2}:\d{2})/g, (match)=>{
                    const classes = [
                        "journal-date"
                    ];
                    switch(match){
                        case "today":
                            classes.push("journal-today");
                            break;
                        case "tomorrow":
                            classes.push("journal-tomorrow");
                            break;
                    }
                    return html`<span class="${classes.join(" ")}">${match}</span>`;
                });
            });
        }
    }
];
const lastElements = new Map();
const observer = new MutationObserver(()=>{
    for (const { selector, update } of updates){
        const elements = Array.from(document.querySelectorAll(selector));
        if (!elements) {
            continue;
        }
        const last = lastElements.get(selector) ?? [];
        const added = elements.filter((e)=>!last.includes(e));
        const removed = last.filter((e)=>!elements.includes(e));
        if (added.length || removed.length) {
            update(elements);
            lastElements.set(selector, elements);
        }
    }
});
observer.observe(document.body, {
    childList: true,
    subtree: true
});
