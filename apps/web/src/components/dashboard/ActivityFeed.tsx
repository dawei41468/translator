import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/lib/hooks';
import { TrendingUp, FolderKanban } from 'lucide-react';
import { cn, getBusinessUnitBadgeClass } from '@/lib/utils';

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'lead':
      return <TrendingUp className="h-4 w-4 text-accent" />;
    case 'project':
      return <FolderKanban className="h-4 w-4 text-primary" />;
    default:
      return null;
  }
};

export function ActivityFeed() {
  const navigate = useNavigate();
  const { data: dashboard } = useDashboard();
  const activityFeed = (dashboard?.recentActivity ?? []).slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activityFeed.map((activity) => (
          <div
            key={activity.id}
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => navigate(`/projects/${activity.project.id}`)}
          >
            <Avatar className="h-9 w-9 border">
              <AvatarFallback className="text-xs font-medium bg-muted">
                {(activity.user.name || 'U').slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{activity.user.name}</span>
                <Badge 
                  variant="outline" 
                  className={cn('text-[10px] px-1.5 py-0', getBusinessUnitBadgeClass(activity.user.businessUnit))}
                >
                  {activity.user.businessUnit}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {activity.action}{' '}
                <span className="font-medium text-foreground">{activity.project.projectName}</span>
              </p>
              <div className="flex items-center gap-2 pt-1">
                {getActivityIcon(activity.type)}
                <span className="text-xs text-muted-foreground">
                  {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Recently'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
