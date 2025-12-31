import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  variant?: 'default' | 'warning' | 'success' | 'accent';
}

const variantStyles = {
  default: {
    icon: 'bg-primary/10 text-primary',
    card: '',
  },
  warning: {
    icon: 'bg-warning/10 text-warning',
    card: 'border-warning/20',
  },
  success: {
    icon: 'bg-success/10 text-success',
    card: '',
  },
  accent: {
    icon: 'bg-accent/10 text-accent',
    card: '',
  },
};

export function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendUp,
  variant = 'default' 
}: MetricCardProps) {
  const styles = variantStyles[variant];

  return (
    <Card className={cn('transition-all hover:shadow-card-hover', styles.card)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {trend && (
              <p className={cn(
                'text-xs font-medium',
                trendUp ? 'text-success' : 'text-destructive'
              )}>
                {trend}
              </p>
            )}
          </div>
          <div className={cn('rounded-xl p-3', styles.icon)}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
