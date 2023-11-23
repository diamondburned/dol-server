const updates: Updater[] = [
  {
    selector: `[data-overlay="journal"] ul li`,
    update: (listItems) => {
      listItems.forEach((li) => {
        li.innerHTML = li.textContent.replaceAll(
          /(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|today|tomorrow|in \d* days|\d{2}:\d{2})/g,
          `<span class="journal-date">$1</span>`,
        );
      });
    },
  },
];

type Updater = {
  selector: string;
  update: (elements: Element[]) => void;
};

const lastElements = new Map<string, Element[]>();
const observer = new MutationObserver(() => {
  for (const { selector, update } of updates) {
    const elements = Array.from(document.querySelectorAll(selector));
    if (!elements) {
      continue;
    }

    const last = lastElements.get(selector) ?? [];
    const added = elements.filter((e) => !last.includes(e));
    const removed = last.filter((e) => !elements.includes(e));

    if (added.length || removed.length) {
      update(elements);
      lastElements.set(selector, elements);
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
