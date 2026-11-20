import { Menu, Portal } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import {
  cloneElement,
  type MouseEventHandler,
  type ReactElement,
  useState,
} from "react";
import styles from "./ChoiceMenu.module.css";
import { Icon } from "./Icon";

export function ChoiceMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  children,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  children: ReactElement<{ onClick?: MouseEventHandler<HTMLButtonElement> }>;
}) {
  const reduceMotion = useReducedMotion();
  const [opened, setOpened] = useState(false);
  const [anchor, setAnchor] = useState<{
    above: boolean;
    mainAxis: number;
    crossAxis: number;
  }>();
  return (
    <>
      {opened && (
        <Portal>
          <div
            className={styles.dismiss}
            aria-hidden="true"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setOpened(false)}
          />
        </Portal>
      )}
      <Menu
        opened={opened}
        onChange={setOpened}
        closeOnClickOutside={false}
        position={
          anchor ? (anchor.above ? "top-start" : "bottom-start") : "bottom-end"
        }
        floatingStrategy="fixed"
        offset={anchor ?? 4}
        returnFocus
        withInitialFocusPlaceholder={false}
        middlewares={{
          flip: anchor ? false : { padding: 16 },
          shift: { padding: 16 },
          size: {
            padding: 16,
            apply: ({ elements, availableHeight }) => {
              elements.floating.style.setProperty(
                "--menu-room",
                `${Math.max(0, availableHeight)}px`,
              );
            },
          },
        }}
        transitionProps={{
          transition: "pop",
          duration: reduceMotion ? 0 : 150,
        }}
        classNames={{
          dropdown: styles.menu,
          item: styles.item,
          itemLabel: styles.label,
        }}
      >
        <Menu.Target>
          {cloneElement(children, {
            onClick: (event) => {
              children.props.onClick?.(event);
              if (event.detail === 0) {
                setAnchor(undefined);
                return;
              }
              const bounds = event.currentTarget.getBoundingClientRect();
              const below = window.innerHeight - event.clientY;
              const preferredHeight = Math.min(304, 8 + options.length * 50);
              const above =
                below < Math.min(preferredHeight + 20, event.clientY);
              setAnchor({
                above,
                crossAxis: event.clientX - bounds.left,
                mainAxis:
                  4 +
                  (above
                    ? bounds.top - event.clientY
                    : event.clientY - bounds.bottom),
              });
            },
          })}
        </Menu.Target>
        <Menu.Dropdown aria-label={label}>
          {options.map((option) => {
            const checked = option.value === value;
            return (
              <Menu.Item
                key={option.value}
                renderRoot={(props) => (
                  <button
                    {...props}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                  />
                )}
                data-autofocus={checked || undefined}
                data-checked={checked || undefined}
                onClick={() => onChange(option.value)}
              >
                {checked && <Icon name="check" />}
                <span>{option.label}</span>
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
