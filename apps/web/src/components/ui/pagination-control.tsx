import { Button } from "./button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { useTranslation } from "react-i18next";

interface PaginationProps {
    page: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
    onLimitChange?: (limit: number) => void;
    showPageSizeSelector?: boolean;
}

export function Pagination({ page, total, limit, onPageChange, onLimitChange, showPageSizeSelector = false }: PaginationProps) {
    const { t } = useTranslation();
    const totalPages = Math.ceil(total / limit);

    if (totalPages <= 1 && !showPageSizeSelector) return null;

    return (
        <div className="flex items-center justify-between pt-6">
            {showPageSizeSelector && onLimitChange && (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('common.pagination.itemsPerPage')}</span>
                    <Select value={limit.toString()} onValueChange={(value) => onLimitChange(parseInt(value))}>
                        <SelectTrigger className="w-20">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
            {totalPages > 1 && (
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(Math.max(1, page - 1))}
                        disabled={page === 1}
                    >
                        {t('common.pagination.previous')}
                    </Button>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                        {t('common.pagination.pageOf', { current: page, total: totalPages })}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                    >
                        {t('common.pagination.next')}
                    </Button>
                </div>
            )}
        </div>
    );
}
