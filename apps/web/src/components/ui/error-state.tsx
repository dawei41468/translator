import { AlertCircle, RefreshCcw } from "lucide-react"
import { Button } from "./button"
import { cn } from "@/lib/utils"

interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string
    message: string
    onRetry?: () => void
}

export function ErrorState({
    title = "Something went wrong",
    message,
    onRetry,
    className,
    ...props
}: ErrorStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center py-12 px-4 text-center animate-in fade-in duration-300",
                className
            )}
            {...props}
        >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
                <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-sm">
                {message}
            </p>
            {onRetry && (
                <Button onClick={onRetry} variant="outline" className="gap-2">
                    <RefreshCcw className="h-4 w-4" />
                    Try Again
                </Button>
            )}
        </div>
    )
}
