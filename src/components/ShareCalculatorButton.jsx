import Swal from "sweetalert2";
import { calculatorLinks, getCalculatorToken } from "../api/calculatorLink.js";
import { copyText } from "../lib/clipboard.js";
import { isDemo } from "../lib/demo.js";
import { friendlyMessage } from "../lib/errors.js";

const DIALOG = { theme: "dark", customClass: { popup: "calc-share-popup" } };

// Share the Catering Calculator with an employee, two ways:
//  - Staff link: the normal page; they log in with their own staff login
//    and get everything (saved quotes, Make invoice).
//  - No-login link: a signed link that opens only the calculator.
export default function ShareCalculatorButton({ className = "" }) {
  const share = async () => {
    const choice = await Swal.fire({
      ...DIALOG,
      title: "Send the calculator",
      html: `<p style="text-align:left;line-height:1.5">
          <b>No-login link</b>: opens only the calculator, for anyone you send it to. Saved quotes stay on their phone, and Make invoice is off.<br><br>
          <b>Staff link</b>: for employees with their own staff login. They get the full app.
        </p>`,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "No-login link",
      denyButtonText: "Staff link",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#f1a33c",
      denyButtonColor: "#5c5c5c",
    });
    if (choice.isDismissed) return;

    let url;
    if (choice.isConfirmed) {
      try {
        url = calculatorLinks(await getCalculatorToken()).public;
      } catch (err) {
        Swal.fire({ ...DIALOG, icon: "error", title: "Couldn't make the link", text: friendlyMessage(err, "Check your connection and try again.") });
        return;
      }
    } else {
      url = calculatorLinks("").staff;
    }
    showLink(url, choice.isConfirmed);
  };

  return (
    <button type="button" onClick={share} className={className} aria-label="Send the calculator to an employee" title="Send to an employee">
      <i className="fa-solid fa-share-nodes text-lg" aria-hidden="true"></i>
    </button>
  );
}

// The link, with Copy and (on phones) Share. These run straight from a
// button tap, which browsers require for copying and the share sheet.
function showLink(url, isPublic) {
  const canShare = typeof navigator.share === "function";
  const demoNote = isDemo() ? "<br><small>(Demo: this link only works in this browser.)</small>" : "";
  Swal.fire({
    ...DIALOG,
    title: isPublic ? "No-login link" : "Staff link",
    html: `<p style="margin-bottom:.75rem">${isPublic ? "Anyone with this link can use the calculator without logging in." : "They'll be asked to log in first."}${demoNote}</p>`,
    input: "text",
    inputValue: url,
    inputAttributes: { readonly: "readonly", "aria-label": "Link" },
    didOpen: (popup) => popup.querySelector("input")?.select(),
    showDenyButton: canShare,
    denyButtonText: "Share…",
    confirmButtonText: "Copy link",
    confirmButtonColor: "#f1a33c",
    denyButtonColor: "#5c5c5c",
    showCloseButton: true,
    preConfirm: async () => {
      if (await copyText(url)) return true;
      Swal.showValidationMessage("Couldn't copy. Select the link and copy it.");
      return false;
    },
    preDeny: () => {
      navigator.share({ title: "Catering Calculator", url }).catch(() => {});
      return true;
    },
  }).then((r) => {
    if (r.isConfirmed) Swal.fire({ ...DIALOG, icon: "success", title: "Link copied", timer: 1400, showConfirmButton: false });
  });
}
