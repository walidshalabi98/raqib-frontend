import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Shield, TrendingDown, Minus, TrendingUp, Loader2, RefreshCw } from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
};

const TREND_ICONS: Record<string, any> = {
  declining: TrendingDown,
  stagnant: Minus,
  improving: TrendingUp,
};

export default function RiskAlerts({ projectId }: { projectId: string }) {
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["risk-analysis", projectId],
    queryFn: () => api.getRiskAnalysis(projectId),
    enabled,
  });

  if (!enabled) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
          <h3 className="font-semibold mb-2">AI Risk Analysis</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Our AI will analyze your indicators, identify risks, and suggest corrective actions.
          </p>
          <Button onClick={() => setEnabled(true)}>
            <AlertTriangle className="mr-2 h-4 w-4" /> Run Risk Analysis
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm text-muted-foreground">AI is analyzing project risks...</p>
          <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
        </CardContent>
      </Card>
    );
  }

  const risks = data?.risks || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" /> Risk Alerts ({risks.length})
        </h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Re-analyze
        </Button>
      </div>

      {risks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-green-600">
            <Shield className="h-10 w-10 mx-auto mb-2" />
            <p className="font-medium">All indicators are on track!</p>
            <p className="text-sm text-muted-foreground">No risks detected at this time.</p>
          </CardContent>
        </Card>
      ) : (
        risks.map((risk: any) => {
          const TrendIcon = TREND_ICONS[risk.trend] || Minus;
          return (
            <Card key={risk.indicatorId} className="border-l-4" style={{ borderLeftColor: risk.riskLevel === 'critical' ? '#ef4444' : risk.riskLevel === 'high' ? '#f97316' : risk.riskLevel === 'medium' ? '#f59e0b' : '#3b82f6' }}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{risk.indicatorText}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={RISK_COLORS[risk.riskLevel]}>
                      {risk.riskLevel}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <TrendIcon className="h-3 w-3 mr-1" /> {risk.trend}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="text-muted-foreground">Level: <strong>{risk.level}</strong></span>
                  <span className="text-muted-foreground">Current: <strong>{risk.currentValue ?? 'N/A'}</strong></span>
                  <span className="text-muted-foreground">Target: <strong>{risk.targetValue ?? 'N/A'}</strong></span>
                </div>
                <div className="bg-muted/50 rounded-md p-3">
                  <p className="text-sm font-medium mb-1">AI Analysis</p>
                  <p className="text-sm text-muted-foreground">{risk.aiAnalysis}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Suggested Actions</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {risk.suggestedActions?.map((action: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary mt-1">-</span> {action}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground italic">Impact: {risk.estimatedImpact}</p>
              </CardContent>
            </Card>
          );
        })
      )}
      {data?.analyzedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Last analyzed: {new Date(data.analyzedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
