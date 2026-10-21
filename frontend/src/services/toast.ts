import Swal from "sweetalert2";

const SUCCESS = "#0f172a";
const PROGRESS = "#334155";

const fire = (
  icon: "success" | "error" | "warning" | "info",
  message: string,
  description?: string
) => {
  if (icon === "success") {
    return Swal.fire({
      icon,
      iconColor: SUCCESS,
      title: message,
      text: description,
      timer: 1200,
      showConfirmButton: false,
      timerProgressBar: true,
      didOpen: () => {
        const bar = Swal.getTimerProgressBar();
        if (bar) bar.style.backgroundColor = PROGRESS;
      },
    });
  }

  return Swal.fire({
    icon,
    iconColor: icon === "warning" ? "#334155" : icon === "info" ? "#0f172a" : undefined,
    title: message,
    text: description,
    confirmButtonColor: "#334155",
  });
};

export const toast = {
  success: (message: string, description?: string) =>
    fire("success", message, description),

  error: (message: string, description?: string) =>
    fire("error", message, description),

  warning: (message: string, description?: string) =>
    fire("warning", message, description),

  info: (message: string, description?: string) =>
    fire("info", message, description),

  /** Dialog with confirm / cancel - resolves true when confirmed */
  confirm: (
    message: string,
    options?: { description?: string; confirmLabel?: string; cancelLabel?: string }
  ): Promise<boolean> =>
    Swal.fire({
      title: message,
      text: options?.description,
      icon: "warning",
      iconColor: "#334155",
      showCancelButton: true,
      confirmButtonColor: "#334155",
      cancelButtonColor: "#0f172a",
      confirmButtonText: options?.confirmLabel ?? "Confirm",
      cancelButtonText: options?.cancelLabel ?? "Cancel",
    }).then((result) => result.isConfirmed),
};
