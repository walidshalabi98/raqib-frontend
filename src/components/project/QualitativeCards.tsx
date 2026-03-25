import { useState } from "react";
import { mockQualitativeEntries, mockIndicators } from "@/data/mockData";
import { Users, MapPin, MessageSquare, FileText } from "lucide-react";

const sentimentColor: Record<string, string> = {
  positive: "bg-success",
  mixed: "bg-warning",
  negative: "bg-danger",
};

const typeIcons: Record<string, React.ElementType> = {
  fgd_transcript: MessageSquare,
  kii_notes: FileText,
};

const themeLabels: Record<string, string> = {
  market_access: "Market Access",
  gender_barriers: "Gender Barriers",
  transportation: "Transportation",
  childcare: "Childcare",
  institutional_support: "Institutional Support",
  policy_alignment: "Policy Alignment",
  budget_constraints: "Budget Constraints",
  skills_relevance: "Skills Relevance",
  employment_prospects: "Employment Prospects",
  training_quality: "Training Quality",
  mentorship: "Mentorship",
};

export function QualitativeCards() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {mockQualitativeEntries.map(entry => {
        const Icon = typeIcons[entry.type] || FileText;
        const isExpanded = expandedId === entry.id;
        return (
          <div
            key={entry.id}
            className="card-surface p-5 hover:border-border-strong transition-colors cursor-pointer"
            onClick={() => setExpandedId(isExpanded ? null : entry.id)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold">{entry.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {entry.participants}</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {entry.location}</span>
                    <span>{entry.date_conducted}</span>
                  </div>
                </div>
              </div>
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${sentimentColor[entry.sentiment]}`} />
                <span className="text-xs text-muted-foreground capitalize">{entry.sentiment}</span>
              </span>
            </div>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {entry.themes.map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium">
                  {themeLabels[t] || t}
                </span>
              ))}
            </div>
            {isExpanded && (
              <div className="mt-3 pt-3 border-t animate-fade-in">
                <p className="text-sm text-muted-foreground leading-relaxed">{entry.content}</p>
                <div className="mt-3 flex gap-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold text-muted-foreground mr-1">Linked indicators:</span>
                  {entry.linked_indicators.map(indId => {
                    const ind = mockIndicators.find(i => i.id === indId);
                    return ind ? (
                      <span key={indId} className="text-[10px] px-2 py-0.5 rounded-md bg-primary-light text-primary font-medium">
                        {ind.indicator_text.slice(0, 40)}...
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
