import { Toaster } from "react-hot-toast";

/**
 * One toaster for the whole app. Toasts are for short feedback on something the
 * user just did ("Saved", "Couldn't delete"), and for live notifications as they
 * arrive. Form field errors, errors inside
 * dialogs and states that last (a paused Autopilot, a failed payment) stay inline.
 */
function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      containerStyle={{ top: 72, right: 16, left: 16 }}
      toastOptions={{
        duration: 4000,
        className:
          "!max-w-sm !rounded-lg !border !border-line !bg-surface !px-3 !py-2.5 !text-sm !text-ink !shadow-lg",
        success: { iconTheme: { primary: "#16a34a", secondary: "#ffffff" } },
        error: { duration: 6000, iconTheme: { primary: "#dc2626", secondary: "#ffffff" } },
      }}
    />
  );
}

export default AppToaster;
