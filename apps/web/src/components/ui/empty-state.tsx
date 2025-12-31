import * as React from "react"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
    icon?: LucideIcon
    title: string
    description?: string
    action?: React.ReactNode
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
    ...props
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed rounded-lg animate-in fade-in zoom-in duration-300",
                className
            )}
            {...props}
        >
            {Icon && (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
            )}
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            {description && (
                <p className="text-sm text-muted-foreground mt-2 mb-4 max-w-sm">
                    {description}
                </p>
            )}
            {action && <div className="mt-2">{action}</div>}
        </div>
    )
}
