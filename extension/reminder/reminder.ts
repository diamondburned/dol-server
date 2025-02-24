import { waitForSugarCube } from "#/lib/sugarcube.ts";
import { html } from "https://deno.land/x/html@v1.2.0/mod.ts";
import "#/lib/dol-time.d.ts";

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/x/reminder/reminder.css";
document.head.appendChild(stylesheet);

const SugarCube = await waitForSugarCube();

function createElementFromHTML(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return div.firstChild as HTMLElement;
}

class ReminderBox {
  constructor() {}

  div = createElementFromHTML(html`
    <div id="reminder-box">
      <div id="reminder-box-header">
        <span>REMINDERS</span>
        <button id="reminder-box-add-button">+</button>
      </div>
      <ol id="reminder-box-list"></ol>
    </div>
  `);

  private addButton = this.div.querySelector("#reminder-box-add-button")!;
  private list = this.div.querySelector("#reminder-box-list")!;
}

const reminderBox = new ReminderBox();

document
  .getElementById("overlayButtons")
  .append(document.createElement("br"), reminderBox.div);

type PassageEvent = {
  content: HTMLElement;
  passage: TwineSugarCube.Passage;
};

$(document).on(":passagerender", (event: PassageEvent) => {
  console.log("(3) changed passage to", event);
});
