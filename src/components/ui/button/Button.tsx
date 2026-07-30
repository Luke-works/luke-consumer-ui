import { ReactNode } from "react";
import { ICON_LABEL_NUDGE_SELF } from "../../../lib/iconAlign";

interface ButtonProps {
  children: ReactNode; // Button text or content
  size?: "sm" | "md"; // Button size
  variant?: "primary" | "outline" | "danger"; // Button variant
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: () => void; // Click handler
  disabled?: boolean; // Disabled state
  className?: string; // Disabled state
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  className = "",
  disabled = false,
}) => {
  // Size Classes
  const sizeClasses = {
    sm: "px-4 py-3 text-sm",
    md: "px-5 py-3.5 text-sm",
  };

  // Variant Classes
  const variantClasses = {
    primary:
      "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300",
    outline:
      "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300",
    danger:
      "bg-error-500 text-white shadow-theme-xs hover:bg-error-600 disabled:bg-error-300",
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition ${className} ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {/* The nudge applies only when the icon actually accompanies a LABEL — see ICON_LABEL_NUDGE_SELF.
          With no label there is nothing to align to and it would just sit the glyph high. */}
      {startIcon && (
        <span className={`flex items-center ${children ? ICON_LABEL_NUDGE_SELF : ""}`}>{startIcon}</span>
      )}
      {children}
      {endIcon && (
        <span className={`flex items-center ${children ? ICON_LABEL_NUDGE_SELF : ""}`}>{endIcon}</span>
      )}
    </button>
  );
};

export default Button;
