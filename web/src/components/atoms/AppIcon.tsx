import { useState } from "react";
import styles from "./AppIcon.module.css";

export function AppIcon({
  name,
  label,
  icon,
}: {
  name: string;
  label?: string;
  icon?: string;
}) {
  const [failed, setFailed] = useState(false);
  const text = Array.from(label?.trim() || name)[0]?.toLocaleUpperCase() ?? "?";
  return (
    <span
      className={styles.icon}
      data-icon-source={icon && !failed ? "host" : "fallback"}
      data-icon-uri={icon}
      aria-hidden="true"
    >
      {icon && !failed ? (
        <img
          src={icon}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{text}</span>
      )}
    </span>
  );
}
