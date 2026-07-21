"use client"

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"

import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"

export type ComboboxOption = { value: string; label: string }

function Combobox({
  options,
  value,
  onChange,
  placeholder = "—",
  emptyText,
  className,
}: {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  className?: string
}) {
  const selected = options.find((o) => o.value === value) ?? null

  return (
    <ComboboxPrimitive.Root
      items={options}
      value={selected}
      onValueChange={(item) => onChange(item ? (item as ComboboxOption).value : "")}
      isItemEqualToValue={(a, b) => (a as ComboboxOption).value === (b as ComboboxOption).value}
    >
      <div
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-lg border border-input bg-transparent pr-2 pl-2.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          className
        )}
      >
        <ComboboxPrimitive.Input
          placeholder={placeholder}
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {value && (
          <ComboboxPrimitive.Clear
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
            onClick={() => onChange("")}
          >
            <XIcon className="size-3.5" />
          </ComboboxPrimitive.Clear>
        )}
        <ComboboxPrimitive.Icon>
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        </ComboboxPrimitive.Icon>
      </div>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner className="isolate z-50" sideOffset={4}>
          <ComboboxPrimitive.Popup className="max-h-60 w-(--anchor-width) min-w-36 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <ComboboxPrimitive.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
              {emptyText ?? "—"}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List>
              {(item: ComboboxOption) => (
                <ComboboxPrimitive.Item
                  key={item.value}
                  value={item}
                  className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </ComboboxPrimitive.ItemIndicator>
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}

export { Combobox }
