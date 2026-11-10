import * as RadixSelect from "@radix-ui/react-select";
import "./Select.css";

export default function Select({ id, value, onChange, disabled, placeholder, children }) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger id={id} className="select-trigger">
        <RadixSelect.Value placeholder={placeholder ?? "Select…"} />
        <RadixSelect.Icon className="select-icon">▾</RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content className="select-content" position="popper" sideOffset={4}>
          <RadixSelect.Viewport className="select-viewport">
            {children}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

export function SelectItem({ value, children, disabled }) {
  return (
    <RadixSelect.Item value={String(value)} disabled={disabled} className="select-item">
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}
