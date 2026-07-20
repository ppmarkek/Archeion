import { cn } from "@/lib/utils";

type AnimatedGridPatternProps = {
  className?: string;
};

function AnimatedGridPattern({ className }: AnimatedGridPatternProps) {
  return <div aria-hidden="true" className={cn("magic-grid pointer-events-none absolute inset-0", className)} />;
}

export { AnimatedGridPattern };
