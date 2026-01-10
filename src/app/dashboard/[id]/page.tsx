'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Download,
  Filter as FilterIcon,
  ChevronDown,
  Loader2,
  LayoutGrid,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { FilterPanel } from '@/components/dashboard/FilterPanel';
import { ChartContainer } from '@/components/dashboard/ChartContainer';
import { EditableTable } from '@/components/csv/EditableTable';
import { useLanguage } from '@/context/LanguageContext';
import { Filter } from '@/types/filter';
import { ColumnInfo, CsvData } from '@/types/csv';
import { calculateKpis, detectKpiColumns } from '@/lib/kpi-calculator';
import { convertToCsv, downloadCsv } from '@/lib/csv-parser';
import { toast } from 'sonner';

interface DataRow {
  id: string;
  datasetId: string;
  rowIndex: number;
  data: Record<string, unknown>;
}

interface Dataset {
  id: string;
  name: string;
  fileName: string;
  columns: ColumnInfo[];
  rowCount: number;
  rows: DataRow[];
}

export default function DatasetDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const datasetId = params.id as string;
  const { t } = useLanguage();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [priorityColumn, setPriorityColumn] = useState<string | null>(null);

  // Fetch dataset from Supabase
  useEffect(() => {
    async function fetchDataset() {
      try {
        const response = await fetch(`/api/datasets/${datasetId}`);
        const result = await response.json();

        if (result.success) {
          setDataset(result.dataset);
        } else {
          toast.error('Dataset not found');
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Error fetching dataset:', error);
        toast.error('Failed to load dataset');
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    }

    if (datasetId) {
      fetchDataset();
    }
  }, [datasetId, router]);

  // Refresh data function - called after CRUD operations
  const refreshData = useCallback(async () => {
    try {
      const response = await fetch(`/api/datasets/${datasetId}`);
      const result = await response.json();
      if (result.success) {
        setDataset(result.dataset);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }, [datasetId]);

  // Convert dataset rows to CSV data format
  const csvData: CsvData | null = useMemo(() => {
    if (!dataset) return null;

    return {
      columns: dataset.columns,
      rows: dataset.rows.map(row => row.data as Record<string, string | number | Date | null>),
      rawHeaders: dataset.columns.map(c => c.name),
      fileName: dataset.fileName,
      totalRows: dataset.rowCount,
    };
  }, [dataset]);

  // Apply filters to get filtered data
  const filteredData = useMemo(() => {
    if (!csvData) return [];

    const activeFilters = filters.filter(f => f.isActive);
    if (activeFilters.length === 0) return csvData.rows;

    return csvData.rows.filter(row => {
      return activeFilters.every(filter => {
        const value = row[filter.columnName];

        switch (filter.columnType) {
          case 'text':
            const textValue = String(value ?? '').toLowerCase();
            const filterValue = filter.value.toLowerCase();
            switch (filter.operator) {
              case 'equals':
                return textValue === filterValue;
              case 'contains':
                return textValue.includes(filterValue);
              case 'startsWith':
                return textValue.startsWith(filterValue);
              case 'endsWith':
                return textValue.endsWith(filterValue);
              default:
                return true;
            }

          case 'number':
            const numValue = Number(value);
            const filterNum = Number(filter.value);
            const filterMax = filter.valueTo ? Number(filter.valueTo) : filterNum;
            switch (filter.operator) {
              case 'equals':
                return numValue === filterNum;
              case 'greaterThan':
                return numValue > filterNum;
              case 'lessThan':
                return numValue < filterNum;
              case 'between':
                return numValue >= filterNum && numValue <= filterMax;
              default:
                return true;
            }

          case 'date':
            const dateValue = value instanceof Date ? value : new Date(String(value));
            const fromDate = filter.from ? new Date(filter.from) : null;
            const toDate = filter.to ? new Date(filter.to) : null;
            if (filter.operator === 'dateRange') {
              if (fromDate && toDate) {
                return dateValue >= fromDate && dateValue <= toDate;
              } else if (fromDate) {
                return dateValue >= fromDate;
              } else if (toDate) {
                return dateValue <= toDate;
              }
            }
            return true;

          case 'category':
            const selectedValues = filter.values || [];
            if (selectedValues.length === 0) return true;
            return selectedValues.includes(String(value));

          default:
            return true;
        }
      });
    });
  }, [csvData, filters]);

  // Calculate KPIs
  const kpiData = useMemo(() => {
    if (!csvData || filteredData.length === 0) return null;

    const kpiColumns = detectKpiColumns(csvData.columns);
    return calculateKpis(filteredData, kpiColumns);
  }, [csvData, filteredData]);

  // Export handler
  const handleExport = useCallback(() => {
    if (!csvData) return;

    const csvContent = convertToCsv(filteredData, csvData.columns);
    const fileName = `filtered_${csvData.fileName}`;
    downloadCsv(csvContent, fileName);

    toast.success(t('common.success'), {
      description: `Exported ${filteredData.length} rows to ${fileName}`,
    });
  }, [csvData, filteredData, t]);

  // Delete dataset handler
  const handleDelete = useCallback(async () => {
    if (!confirm('Are you sure you want to delete this dataset?')) return;

    try {
      const response = await fetch(`/api/datasets/${datasetId}`, { method: 'DELETE' });
      const result = await response.json();

      if (result.success) {
        toast.success('Dataset deleted');
        router.push('/dashboard');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error deleting dataset:', error);
      toast.error('Failed to delete dataset');
    }
  }, [datasetId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!csvData || !dataset) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Dataset not found</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          Back to Datasets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{dataset.name}</h1>
          <p className="text-sm text-muted-foreground">
            {csvData.fileName} • {filteredData.length} {t('common.of')} {csvData.totalRows}{' '}
            {t('common.rows')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="gap-2 border-gray-400 text-gray-600 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">All Reports</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t('common.export')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="gap-2 border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpiData && <KpiCards kpiData={kpiData} />}

      {/* Filter Panel - collapsible */}
      <details className="group" open>
        <summary className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer list-none hover:bg-muted/70 transition-colors">
          <span className="font-medium flex items-center gap-2">
            <FilterIcon className="h-4 w-4" />
            {t('filter.title')}
            {filters.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {filters.filter(f => f.isActive).length} active
              </Badge>
            )}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="pt-3">
          <FilterPanel
            columns={csvData.columns}
            filters={filters}
            onAddFilter={filter => setFilters(prev => [...prev, filter])}
            onUpdateFilter={(id, updates) =>
              setFilters(prev =>
                prev.map(f => (f.id === id ? ({ ...f, ...updates } as typeof f) : f))
              )
            }
            onRemoveFilter={id => setFilters(prev => prev.filter(f => f.id !== id))}
            onClearAll={() => setFilters([])}
            onSetPriorityColumn={setPriorityColumn}
            priorityColumn={priorityColumn}
          />
        </div>
      </details>

      {/* Tabs for Charts and Table */}
      <Tabs defaultValue="charts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="table">Data Table</TabsTrigger>
        </TabsList>

        <TabsContent value="charts" className="space-y-4">
          <ChartContainer data={filteredData} columns={csvData.columns} />
        </TabsContent>

        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Table</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableTable
                data={csvData.rows}
                columns={csvData.columns}
                datasetId={datasetId}
                rowIds={dataset.rows.map(r => r.id)}
                onDataChange={refreshData}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
