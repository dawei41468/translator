import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface ValidationErrorProps {
  error: {
    message: string;
    details?: any[];
  };
}

export function ValidationError({ error }: ValidationErrorProps) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Invalid Request</AlertTitle>
      <AlertDescription>
        <div className="space-y-2">
          <p>{error.message}</p>
          {error.details && error.details.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">Details:</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                {error.details.map((detail, index) => (
                  <li key={index} className="text-xs">
                    {detail.message || JSON.stringify(detail)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}