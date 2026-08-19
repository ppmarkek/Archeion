"use client";

import * as React from "react";

import { useNotifications } from "@/components/notifications/notification-provider";
import { useAppSettings } from "@/components/settings/settings-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckIcon,
  ChevronRightIcon,
  ErrorIcon,
  InfoIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  WarningIcon,
} from "@/components/vault/vault-icons";
import type { NotificationSettings, ThemePreference } from "@/lib/settings";
import { cn } from "@/lib/utils";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type DurationPreset = "short" | "normal" | "long";
type DurationValues = Pick<
  NotificationSettings,
  "successDurationMs" | "infoDurationMs" | "warningDurationMs"
>;

const durationPresets: Record<DurationPreset, DurationValues> = {
  short: {
    successDurationMs: 2_450,
    infoDurationMs: 3_500,
    warningDurationMs: 5_600,
  },
  normal: {
    successDurationMs: 3_500,
    infoDurationMs: 5_000,
    warningDurationMs: 8_000,
  },
  long: {
    successDurationMs: 4_900,
    infoDurationMs: 7_000,
    warningDurationMs: 11_200,
  },
};

const themeOptions = [
  { value: "light", label: "Светлая", Icon: SunIcon },
  { value: "system", label: "Как в системе", Icon: MonitorIcon },
  { value: "dark", label: "Тёмная", Icon: MoonIcon },
] satisfies ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}>;

const durationOptions = [
  { value: "short", label: "Коротко" },
  { value: "normal", label: "Обычно" },
  { value: "long", label: "Дольше" },
] satisfies ReadonlyArray<{ value: DurationPreset; label: string }>;

const maxVisibleOptions = [1, 2, 3] as const;

const categoryOptions = [
  {
    key: "showSuccess",
    label: "Успешные",
    Icon: CheckIcon,
    iconClassName: "text-emerald-600 dark:text-emerald-300",
  },
  {
    key: "showInfo",
    label: "Информация",
    Icon: InfoIcon,
    iconClassName: "text-primary",
  },
  {
    key: "showWarning",
    label: "Предупреждения",
    Icon: WarningIcon,
    iconClassName: "text-amber-600 dark:text-amber-300",
  },
  {
    key: "showError",
    label: "Ошибки",
    Icon: ErrorIcon,
    iconClassName: "text-destructive",
  },
] satisfies ReadonlyArray<{
  key: "showSuccess" | "showInfo" | "showWarning" | "showError";
  label: string;
  Icon: React.ComponentType<{ className?: string; motion?: "none" }>;
  iconClassName: string;
}>;

function closestDurationPreset(notifications: NotificationSettings): DurationPreset {
  const keys: Array<keyof DurationValues> = [
    "successDurationMs",
    "infoDurationMs",
    "warningDurationMs",
  ];

  return (Object.entries(durationPresets) as Array<[DurationPreset, DurationValues]>)
    .map(([preset, values]) => ({
      preset,
      distance: keys.reduce((total, key) => total + Math.abs(notifications[key] - values[key]), 0),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.preset ?? "normal";
}

function SettingSwitch({
  checked,
  description,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const labelId = React.useId();
  const descriptionId = React.useId();

  return (
    <div className={cn("flex min-h-12 items-center gap-4 py-1.5", disabled && "opacity-45")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground" id={labelId}>{label}</p>
        <p className="mt-0.5 text-xs leading-4 text-muted-foreground" id={descriptionId}>{description}</p>
      </div>
      <button
        aria-checked={checked}
        aria-describedby={descriptionId}
        aria-labelledby={labelId}
        className="group grid size-10 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-5 w-9 items-center rounded-full px-0.5 transition-colors duration-150 motion-reduce:transition-none",
            checked ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "size-4 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform duration-150 motion-reduce:transition-none",
              checked ? "translate-x-4" : "translate-x-0",
            )}
          />
        </span>
      </button>
    </div>
  );
}

function CategoryOption({
  checked,
  disabled,
  Icon,
  iconClassName,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  Icon: React.ComponentType<{ className?: string; motion?: "none" }>;
  iconClassName: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn("relative block", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <input
        checked={checked}
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        type="checkbox"
      />
      <span className="flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-background/55 peer-checked:bg-accent/75 peer-checked:font-medium peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70 motion-reduce:transition-none">
        <Icon className={cn("size-4 shrink-0", iconClassName)} motion="none" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-full border border-current/25 text-primary transition-colors duration-150 motion-reduce:transition-none",
            checked && "border-primary/30 bg-primary/15",
          )}
        >
          {checked ? <CheckIcon className="size-3" motion="none" /> : null}
        </span>
      </span>
    </label>
  );
}

function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { isReady, resetSettings, settings, updateSettings } = useAppSettings();
  const { notify } = useNotifications();
  const [categoriesOpen, setCategoriesOpen] = React.useState(false);
  const categoriesId = React.useId();
  const notifications = settings.notifications;
  const durationPreset = closestDurationPreset(notifications);
  const notificationOptionsDisabled = !isReady || !notifications.enabled;
  const enabledCategoryCount = categoryOptions.filter(({ key }) => notifications[key]).length;
  const categorySummary = enabledCategoryCount === categoryOptions.length
    ? "Все включены"
    : enabledCategoryCount === 0
      ? "Все выключены"
      : `${enabledCategoryCount} из ${categoryOptions.length}`;

  const updateNotifications = React.useCallback((patch: Partial<NotificationSettings>) => {
    updateSettings({ notifications: patch });
  }, [updateSettings]);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen) setCategoriesOpen(false);
    onOpenChange(nextOpen);
  }, [onOpenChange]);

  const handleReset = React.useCallback(() => {
    resetSettings();
    window.setTimeout(() => {
      notify({
        kind: "success",
        message: "Настройки восстановлены по умолчанию",
        dedupeKey: "reset-app-settings",
      });
    }, 0);
  }, [notify, resetSettings]);

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        aria-busy={!isReady}
        className="max-h-[min(44rem,calc(100dvh-2rem))] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-xl bg-popover p-0"
      >
        <DialogHeader className="border-b px-5 py-4 pr-14 sm:px-6">
          <DialogTitle className="text-lg tracking-[-0.02em]">Настройки</DialogTitle>
          <DialogDescription>
            Внешний вид и обратная связь рабочего пространства.
          </DialogDescription>
        </DialogHeader>

        <div className="auto-hide-scrollbar min-h-0 overflow-y-auto px-5 sm:px-6">
          <section aria-labelledby="settings-appearance-heading" className="py-4">
            <fieldset aria-describedby="settings-appearance-description" disabled={!isReady}>
              <legend className="text-sm font-semibold tracking-[-0.01em] text-foreground" id="settings-appearance-heading">
                Внешний вид
              </legend>
              <p className="mt-1 text-xs leading-4 text-muted-foreground" id="settings-appearance-description">
                Тема применяется ко всему рабочему пространству.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[440px]:grid-cols-3">
                {themeOptions.map(({ value, label, Icon }) => (
                  <label className="relative cursor-pointer" key={value}>
                    <input
                      checked={settings.theme === value}
                      className="peer sr-only"
                      name="settings-theme"
                      onChange={() => updateSettings({ theme: value })}
                      type="radio"
                      value={value}
                    />
                    <span className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-muted/40 px-3 text-sm font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted/65 peer-checked:bg-accent/80 peer-checked:text-accent-foreground peer-checked:ring-1 peer-checked:ring-primary/25 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70 motion-reduce:transition-none">
                      <Icon className="size-4" motion="none" />
                      {label}
                    </span>
                    {settings.theme === value ? (
                      <CheckIcon className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-primary" motion="none" />
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section aria-labelledby="settings-notifications-heading" className="border-t py-4">
            <SettingSwitch
              checked={notifications.enabled}
              description="Короткая обратная связь о действиях без отвлечения от заметки."
              disabled={!isReady}
              label="Уведомления"
              onCheckedChange={(enabled) => updateNotifications({ enabled })}
            />

            <div
              aria-disabled={notificationOptionsDisabled}
              className={cn(
                "mt-3 divide-y rounded-xl bg-muted/25 px-4 transition-opacity duration-150 motion-reduce:transition-none",
                notificationOptionsDisabled && "opacity-45",
              )}
            >
              <div className="py-1.5">
                <button
                  aria-controls={categoriesId}
                  aria-expanded={categoriesOpen}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed"
                  disabled={notificationOptionsDisabled}
                  onClick={() => setCategoriesOpen((current) => !current)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">Типы уведомлений</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{categorySummary}</span>
                  </span>
                  <ChevronRightIcon
                    className={cn(
                      "size-4 text-muted-foreground transition-transform ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none",
                      categoriesOpen ? "rotate-90 duration-200" : "duration-150",
                    )}
                    motion="none"
                  />
                </button>
                <div
                  aria-hidden={!categoriesOpen}
                  className={cn(
                    "grid overflow-hidden transition-[grid-template-rows] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none",
                    categoriesOpen ? "grid-rows-[1fr] duration-200" : "grid-rows-[0fr] duration-150",
                  )}
                  data-state={categoriesOpen ? "open" : "closed"}
                  id={categoriesId}
                  inert={categoriesOpen ? undefined : true}
                >
                  <div
                    className={cn(
                      "min-h-0 overflow-hidden transition-[opacity,transform] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none",
                      categoriesOpen
                        ? "translate-y-0 opacity-100 duration-200"
                        : "pointer-events-none -translate-y-1 opacity-0 duration-150",
                    )}
                  >
                    <fieldset
                      className="grid grid-cols-1 gap-1 pb-2 pt-1 min-[440px]:grid-cols-2"
                      disabled={notificationOptionsDisabled || !categoriesOpen}
                    >
                      <legend className="sr-only">Типы уведомлений</legend>
                      {categoryOptions.map(({ key, label, Icon, iconClassName }) => (
                        <CategoryOption
                          checked={notifications[key]}
                          disabled={notificationOptionsDisabled || !categoriesOpen}
                          Icon={Icon}
                          iconClassName={iconClassName}
                          key={key}
                          label={label}
                          onCheckedChange={(checked) => updateNotifications({ [key]: checked })}
                        />
                      ))}
                      <p className="col-span-full px-3 pt-1 text-xs leading-4 text-muted-foreground">
                        Ошибки остаются видимыми до ручного закрытия.
                      </p>
                    </fieldset>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <fieldset aria-describedby="settings-duration-description" disabled={notificationOptionsDisabled}>
                  <legend className="text-xs font-medium text-muted-foreground">Длительность</legend>
                  <p className="sr-only" id="settings-duration-description">
                    Выберите время показа уведомлений. Ошибки не исчезают автоматически.
                  </p>
                  <div className="mt-2 inline-grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1">
                    {durationOptions.map(({ value, label }) => (
                      <label className={notificationOptionsDisabled ? "cursor-not-allowed" : "cursor-pointer"} key={value}>
                        <input
                          checked={durationPreset === value}
                          className="peer sr-only"
                          name="settings-notification-duration"
                          onChange={() => updateNotifications(durationPresets[value])}
                          type="radio"
                          value={value}
                        />
                        <span
                          className={cn(
                            "grid min-h-8 place-items-center rounded-md px-3 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-accent-foreground peer-checked:ring-1 peer-checked:ring-primary/20 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70 motion-reduce:transition-none",
                            !notificationOptionsDisabled && "hover:bg-accent/55 hover:text-accent-foreground peer-checked:hover:bg-accent",
                          )}
                        >
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset aria-describedby="settings-max-visible-description" disabled={notificationOptionsDisabled}>
                  <legend className="text-xs font-medium text-muted-foreground">Одновременно</legend>
                  <p className="sr-only" id="settings-max-visible-description">
                    Выберите, сколько уведомлений показывать одновременно.
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1">
                    {maxVisibleOptions.map((value) => (
                      <label className={notificationOptionsDisabled ? "cursor-not-allowed" : "cursor-pointer"} key={value}>
                        <input
                          checked={notifications.maxVisible === value}
                          className="peer sr-only"
                          name="settings-max-visible"
                          onChange={() => updateNotifications({ maxVisible: value })}
                          type="radio"
                          value={value}
                        />
                        <span
                          className={cn(
                            "grid min-h-8 place-items-center rounded-md text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 peer-checked:bg-accent peer-checked:font-semibold peer-checked:text-accent-foreground peer-checked:ring-1 peer-checked:ring-primary/20 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/70 motion-reduce:transition-none",
                            !notificationOptionsDisabled && "hover:bg-accent/55 hover:text-accent-foreground peer-checked:hover:bg-accent",
                          )}
                        >
                          {value}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              <div className="py-1">
                <SettingSwitch
                  checked={notifications.pauseOnHover}
                  description="Продолжить отсчёт после ухода курсора или фокуса."
                  disabled={notificationOptionsDisabled}
                  label="Пауза при наведении"
                  onCheckedChange={(pauseOnHover) => updateNotifications({ pauseOnHover })}
                />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="items-center justify-between border-t bg-popover px-5 py-3 sm:px-6">
          <Button disabled={!isReady} onClick={handleReset} type="button" variant="ghost">
            Сбросить
          </Button>
          <DialogClose asChild>
            <Button aria-label="Закрыть настройки" type="button">Закрыть</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { SettingsDialog };
export type { SettingsDialogProps };
