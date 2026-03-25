export function RaqibLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const textSize = size === "lg" ? "text-2xl" : size === "md" ? "text-xl" : "text-base";
  const dotSize = size === "lg" ? "h-2.5 w-2.5" : size === "md" ? "h-2 w-2" : "h-1.5 w-1.5";
  const subSize = size === "lg" ? "text-sm" : "text-xs";
  
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5">
        <span className={`${dotSize} rounded-full bg-primary`} />
        <span className={`${textSize} font-semibold tracking-tight text-foreground`}>Raqib</span>
      </div>
      <span className={`${subSize} text-muted-foreground ml-4`}>by Momentum Labs</span>
    </div>
  );
}
