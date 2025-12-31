import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBusinessUnitBadgeClass } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const getAvatarInitials = (name: string) => {
    return name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">Your account details</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/settings")}>Settings</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border">
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {getAvatarInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-lg font-semibold">{user.name}</div>
                {user.role === "admin" && <Badge variant="secondary">Admin</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
              <Badge variant="outline" className={`w-fit ${getBusinessUnitBadgeClass(user.businessUnit)}`}>
                {user.businessUnit}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Business Unit</div>
              <div className="mt-1 font-medium">{user.businessUnit}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Role</div>
              <div className="mt-1 font-medium">{user.role}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
