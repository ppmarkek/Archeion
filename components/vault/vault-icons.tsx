import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

function ArcheionMark(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M6.5 17.5 12 5l5.5 12.5M8.8 12.25h6.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M4.5 19.5h15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconFrame>
  );
}

function CollectionIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 7.5h14M5 12h14M5 16.5h9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </IconFrame>
  );
}

function NoteIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M7 3.75h7l3.25 3.25v13.25H7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M14 3.75V7h3.25M9.5 11h5M9.5 14h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </IconFrame>
  );
}

function AttachmentIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m8.5 12.5 5.3-5.3a2.5 2.5 0 1 1 3.54 3.54l-6.72 6.72a4 4 0 1 1-5.66-5.66l6.36-6.36" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </IconFrame>
  );
}

function PlusIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </IconFrame>
  );
}

function UploadIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M5 15.5v3.75h14V15.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </IconFrame>
  );
}

function SunIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2.75v2M12 19.25v2M21.25 12h-2M4.75 12h-2M18.54 5.46l-1.42 1.42M6.88 17.12l-1.42 1.42M18.54 18.54l-1.42-1.42M6.88 6.88 5.46 5.46" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </IconFrame>
  );
}

function MoonIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M19.5 15.2A7.75 7.75 0 0 1 8.8 4.5 7.75 7.75 0 1 0 19.5 15.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
    </IconFrame>
  );
}

function MonitorIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect height="12" rx="1.5" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="4.5" />
      <path d="M9 20h6M12 16.5V20" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </IconFrame>
  );
}

function BookIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M5 5.25A2.25 2.25 0 0 1 7.25 3h4.5v15h-4.5A2.25 2.25 0 0 0 5 20.25zM19 5.25A2.25 2.25 0 0 0 16.75 3h-4.5v15h4.5A2.25 2.25 0 0 1 19 20.25z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
    </IconFrame>
  );
}

export {
  ArcheionMark,
  AttachmentIcon,
  BookIcon,
  CollectionIcon,
  MonitorIcon,
  MoonIcon,
  NoteIcon,
  PlusIcon,
  SunIcon,
  UploadIcon,
};
