import classNames from "classnames";
import { forwardRef } from "react";

import { Icon, Icons } from "@/components/Icon";

export interface VideoPlayerButtonProps {
  children?: React.ReactNode;
  onClick?: (el: HTMLButtonElement) => void;
  icon?: Icons;
  iconSizeClass?: string;
  className?: string;
  activeClass?: string;
  /** Accessible label for screen readers (required when button has no visible text) */
  ariaLabel?: string;
  /** Whether the button represents a toggled state (e.g. play/pause, bookmark) */
  ariaPressed?: boolean;
}

export const VideoPlayerButton = forwardRef<
  HTMLButtonElement,
  VideoPlayerButtonProps
>((props, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => props.onClick?.(e.currentTarget as HTMLButtonElement)}
      aria-label={props.ariaLabel}
      aria-pressed={props.ariaPressed}
      className={classNames([
        "tabbable p-2 rounded-full hover:bg-video-buttonBackground hover:bg-opacity-50 transition-transform duration-100 flex items-center gap-3",
        props.activeClass ??
          "active:scale-110 active:bg-opacity-75 active:text-white",
        props.className ?? "",
      ])}
    >
      {props.icon && (
        <Icon
          className={props.iconSizeClass || "text-2xl"}
          icon={props.icon}
          aria-hidden="true"
        />
      )}
      {props.children}
    </button>
  );
});
