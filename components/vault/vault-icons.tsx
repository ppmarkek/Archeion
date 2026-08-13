"use client";

import ArrowAlignBottomSvg from "@iconify-react/line-md/arrow-align-bottom";
import ArrowAlignLeftSvg from "@iconify-react/line-md/arrow-align-left";
import ArrowAlignRightSvg from "@iconify-react/line-md/arrow-align-right";
import ArrowAlignTopSvg from "@iconify-react/line-md/arrow-align-top";
import ArrowsDiagonalSvg from "@iconify-react/line-md/arrows-diagonal";
import CheckSvg from "@iconify-react/line-md/confirm";
import ChevronSmallLeftSvg from "@iconify-react/line-md/chevron-small-left";
import CompassSvg from "@iconify-react/line-md/compass";
import DocumentListSvg from "@iconify-react/line-md/document-list";
import EditSvg from "@iconify-react/line-md/edit";
import ExternalLinkSvg from "@iconify-react/line-md/external-link";
import FileDocumentSvg from "@iconify-react/line-md/file-document";
import FileDocumentPlusSvg from "@iconify-react/line-md/file-document-plus";
import FolderSvg from "@iconify-react/line-md/folder";
import LinkSvg from "@iconify-react/line-md/link";
import ListSvg from "@iconify-react/line-md/list-3";
import LoadingSvg from "@iconify-react/line-md/loading-loop";
import MinusSvg from "@iconify-react/line-md/minus";
import MonitorSvg from "@iconify-react/line-md/monitor";
import MoonSvg from "@iconify-react/line-md/moon";
import PlusSvg from "@iconify-react/line-md/plus";
import SearchSvg from "@iconify-react/line-md/search";
import SunnySvg from "@iconify-react/line-md/sunny-outline";
import UploadSvg from "@iconify-react/line-md/upload-outline";
import type { SVGProps } from "react";

import { AliveIcon } from "@/components/icons/alive-icon";
import type { IconMotion, LineMdIconComponent } from "@/components/icons/alive-icon";

type AppIconProps = {
  className?: string;
  motion?: IconMotion;
};

function createAppIcon(icon: LineMdIconComponent, displayName: string) {
  function AppIcon({ className, motion }: AppIconProps) {
    return <AliveIcon className={className} icon={icon} motion={motion} />;
  }

  AppIcon.displayName = displayName;
  return AppIcon;
}

function ArcheionMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M6.5 17.5 12 5l5.5 12.5M8.8 12.25h6.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M4.5 19.5h15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

const AttachmentIcon = createAppIcon(LinkSvg, "AttachmentIcon");
const BookIcon = createAppIcon(DocumentListSvg, "BookIcon");
const CheckIcon = createAppIcon(CheckSvg, "CheckIcon");
const ChevronLeftIcon = createAppIcon(ChevronSmallLeftSvg, "ChevronLeftIcon");
const CollectionIcon = createAppIcon(ListSvg, "CollectionIcon");
const DockBottomIcon = createAppIcon(ArrowAlignBottomSvg, "DockBottomIcon");
const DockLeftIcon = createAppIcon(ArrowAlignLeftSvg, "DockLeftIcon");
const DockRightIcon = createAppIcon(ArrowAlignRightSvg, "DockRightIcon");
const DockTopIcon = createAppIcon(ArrowAlignTopSvg, "DockTopIcon");
const EditIcon = createAppIcon(EditSvg, "EditIcon");
const ExternalLinkIcon = createAppIcon(ExternalLinkSvg, "ExternalLinkIcon");
const FileDocumentPlusIcon = createAppIcon(FileDocumentPlusSvg, "FileDocumentPlusIcon");
const FitIcon = createAppIcon(ArrowsDiagonalSvg, "FitIcon");
const FolderIcon = createAppIcon(FolderSvg, "FolderIcon");
const GraphIcon = createAppIcon(CompassSvg, "GraphIcon");
const LoadingIcon = createAppIcon(LoadingSvg, "LoadingIcon");
const MinusIcon = createAppIcon(MinusSvg, "MinusIcon");
const MonitorIcon = createAppIcon(MonitorSvg, "MonitorIcon");
const MoonIcon = createAppIcon(MoonSvg, "MoonIcon");
const NoteIcon = createAppIcon(FileDocumentSvg, "NoteIcon");
const PlusIcon = createAppIcon(PlusSvg, "PlusIcon");
const SearchIcon = createAppIcon(SearchSvg, "SearchIcon");
const SunIcon = createAppIcon(SunnySvg, "SunIcon");
const UploadIcon = createAppIcon(UploadSvg, "UploadIcon");

export {
  ArcheionMark,
  AttachmentIcon,
  BookIcon,
  CheckIcon,
  ChevronLeftIcon,
  CollectionIcon,
  DockBottomIcon,
  DockLeftIcon,
  DockRightIcon,
  DockTopIcon,
  EditIcon,
  ExternalLinkIcon,
  FileDocumentPlusIcon,
  FitIcon,
  FolderIcon,
  GraphIcon,
  LoadingIcon,
  MinusIcon,
  MonitorIcon,
  MoonIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  UploadIcon,
};
export type { AppIconProps };
