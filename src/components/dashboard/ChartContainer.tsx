'use client';

import React, { useMemo } from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColumnInfo } from '@/types/csv';
import { aggregateByColumn, formatNumber } from '@/lib/kpi-calculator';
import { useLanguage } from '@/context/LanguageContext';

const COLORS = [
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#84cc16',
  '#f97316',
];

// Custom Premium Tooltip Component
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value?: number;
    name?: string;
    color?: string;
    payload?: {
      name?: string;
      fill?: string;
      percent?: number;
    };
  }>;
  label?: string;
  valueLabel?: string;
  showCurrency?: boolean;
  accentColor?: string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  valueLabel,
  showCurrency,
  accentColor,
}: CustomTooltipProps) => {
  if (!active || !payload || !payload.length) return null;

  const value = payload[0]?.value as number;
  const name = payload[0]?.payload?.name || label;
  const color = accentColor || payload[0]?.payload?.fill || payload[0]?.color || '#8b5cf6';

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/30 animate-in fade-in-0 zoom-in-95 duration-200">
      {/* Gradient accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 opacity-80"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}80)` }}
      />

      <div className="px-4 py-3 space-y-2">
        {/* Label / Name */}
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm"
            style={{ backgroundColor: color }}
          />
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{name}</span>
        </div>

        {/* Value */}
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {valueLabel || 'Value'}
          </span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatNumber(value || 0, showCurrency ? 'currency' : 'number')}
            {showCurrency && <span className="text-sm font-medium text-gray-500 ml-1">Ks</span>}
          </span>
        </div>
      </div>
    </div>
  );
};

// Pie Chart specific tooltip
const PieTooltip = ({ active, payload, valueLabel, showCurrency }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0];
  const value = data?.value as number;
  const name = data?.name || data?.payload?.name;
  const color = data?.payload?.fill || '#8b5cf6';
  const percent = data?.payload?.percent;

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/20 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl shadow-black/10 dark:shadow-black/30 animate-in fade-in-0 zoom-in-95 duration-200">
      {/* Gradient accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 opacity-80"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}80)` }}
      />

      <div className="px-4 py-3 space-y-2">
        {/* Label / Name */}
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm"
            style={{ backgroundColor: color }}
          />
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{name}</span>
          {percent !== undefined && (
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {(percent * 100).toFixed(1)}%
            </span>
          )}
        </div>

        {/* Value */}
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {valueLabel || 'Value'}
          </span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatNumber(value || 0, showCurrency ? 'currency' : 'number')}
            {showCurrency && <span className="text-sm font-medium text-gray-500 ml-1">Ks</span>}
          </span>
        </div>
      </div>
    </div>
  );
};

interface ChartContainerProps {
  data: Record<string, string | number | Date | null>[];
  columns: ColumnInfo[];
}

export function ChartContainer({ data, columns }: ChartContainerProps) {
  const { t } = useLanguage();
  const [groupByColumn, setGroupByColumn] = React.useState<string>('');
  const [valueColumn, setValueColumn] = React.useState<string>('');
  const [reportType, setReportType] = React.useState<string>('custom');

  // Helper to detect if a column is likely a currency/money column
  const isCurrencyColumn = (columnName: string): boolean => {
    const currencyHints = [
      'price',
      'amount',
      'total',
      'revenue',
      'sales',
      'cost',
      'value',
      'payment',
      'fee',
    ];
    const lowerName = columnName.toLowerCase();
    return currencyHints.some(hint => lowerName.includes(hint));
  };

  const textColumns = columns.filter(c => c.type === 'category' || c.type === 'text');
  const numberColumns = columns.filter(c => c.type === 'number');
  const dateColumn = columns.find(c => c.type === 'date');

  // Generate report type presets based on available columns
  const reportPresets = useMemo(() => {
    const presets: { value: string; label: string; groupBy: string; valueCol: string }[] = [
      { value: 'custom', label: 'Custom Report', groupBy: '', valueCol: '' },
    ];

    // Find common column patterns
    const customerCol = textColumns.find(
      c => c.name.toLowerCase().includes('customer') || c.name.toLowerCase().includes('client')
    );
    const productCol = textColumns.find(
      c => c.name.toLowerCase().includes('product') || c.name.toLowerCase().includes('item')
    );
    const categoryCol = textColumns.find(
      c => c.name.toLowerCase().includes('category') || c.name.toLowerCase().includes('type')
    );
    const amountCol = numberColumns.find(
      c =>
        c.name.toLowerCase().includes('amount') ||
        c.name.toLowerCase().includes('total') ||
        c.name.toLowerCase().includes('sales')
    );
    const quantityCol = numberColumns.find(
      c => c.name.toLowerCase().includes('quantity') || c.name.toLowerCase().includes('qty')
    );

    if (customerCol && amountCol) {
      presets.push({
        value: 'sales-by-customer',
        label: 'Sales by Customer',
        groupBy: customerCol.name,
        valueCol: amountCol.name,
      });
    }
    if (customerCol && quantityCol) {
      presets.push({
        value: 'qty-by-customer',
        label: 'Quantity by Customer',
        groupBy: customerCol.name,
        valueCol: quantityCol.name,
      });
    }
    if (productCol && amountCol) {
      presets.push({
        value: 'sales-by-product',
        label: 'Sales by Product',
        groupBy: productCol.name,
        valueCol: amountCol.name,
      });
    }
    if (productCol && quantityCol) {
      presets.push({
        value: 'qty-by-product',
        label: 'Quantity by Product',
        groupBy: productCol.name,
        valueCol: quantityCol.name,
      });
    }
    if (categoryCol && amountCol) {
      presets.push({
        value: 'sales-by-category',
        label: 'Sales by Category',
        groupBy: categoryCol.name,
        valueCol: amountCol.name,
      });
    }

    return presets;
  }, [textColumns, numberColumns]);

  // Handle report type change
  const handleReportTypeChange = (value: string) => {
    setReportType(value);
    const preset = reportPresets.find(p => p.value === value);
    if (preset && preset.groupBy && preset.valueCol) {
      setGroupByColumn(preset.groupBy);
      setValueColumn(preset.valueCol);
    }
  };

  // Auto-select columns on first load
  React.useEffect(() => {
    const categoryCol = columns.find(c => c.type === 'category' || c.type === 'text');
    const numberCol = columns.find(c => c.type === 'number');

    if (categoryCol && !groupByColumn) setGroupByColumn(categoryCol.name);
    if (numberCol && !valueColumn) setValueColumn(numberCol.name);
  }, [columns, groupByColumn, valueColumn]);

  const chartData = useMemo(() => {
    if (!groupByColumn || !valueColumn || data.length === 0) return [];
    return aggregateByColumn(data, groupByColumn, valueColumn, 'sum').slice(0, 10);
  }, [data, groupByColumn, valueColumn]);

  const timeSeriesData = useMemo(() => {
    if (!dateColumn || !valueColumn || data.length === 0) return [];

    return aggregateByColumn(data, dateColumn.name, valueColumn, 'sum')
      .sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime())
      .map(item => ({
        ...item,
        name: new Date(item.name).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }));
  }, [data, dateColumn, valueColumn]);

  const showCurrency = isCurrencyColumn(valueColumn);

  if (data.length === 0) {
    return <div className="text-center text-muted-foreground py-12">{t('common.noData')}</div>;
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Report Type & Column Selectors */}
      <div className="flex flex-col gap-3">
        {/* Report Type Presets */}
        {reportPresets.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">📊 Report Type:</span>
            <Select value={reportType} onValueChange={handleReportTypeChange}>
              <SelectTrigger className="w-full sm:w-64 bg-linear-to-r from-violet-50 to-purple-50 border-violet-200">
                <SelectValue placeholder="Select report type" />
              </SelectTrigger>
              <SelectContent>
                {reportPresets.map(preset => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Custom Column Selectors - only show for Custom Report */}
        {reportType === 'custom' && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-medium whitespace-nowrap">Group by:</span>
              <Select value={groupByColumn} onValueChange={setGroupByColumn}>
                <SelectTrigger className="flex-1 sm:w-40 sm:flex-none">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {textColumns.map(col => (
                    <SelectItem key={col.name} value={col.name}>
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-medium whitespace-nowrap">Value:</span>
              <Select value={valueColumn} onValueChange={setValueColumn}>
                <SelectTrigger className="flex-1 sm:w-40 sm:flex-none">
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {numberColumns.map(col => (
                    <SelectItem key={col.name} value={col.name}>
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Charts Grid - stacks on mobile */}
      <div className="grid gap-4 lg:gap-6 lg:grid-cols-2">
        {/* Line Chart - Sales over Time */}
        {dateColumn && timeSeriesData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('dashboard.charts.salesOverTime')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <RechartsLineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={v => formatNumber(v, 'number')} />
                  <Tooltip
                    content={
                      <CustomTooltip
                        valueLabel={valueColumn}
                        showCurrency={showCurrency}
                        accentColor="#8b5cf6"
                      />
                    }
                    cursor={{ stroke: '#8b5cf6', strokeWidth: 2, strokeOpacity: 0.3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Top 10 {groupByColumn} by {valueColumn}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 40)}>
              <RechartsBarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis
                  type="number"
                  className="text-xs"
                  tickFormatter={v => formatNumber(v, 'number')}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  className="text-xs"
                  width={120}
                  interval={0}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  content={<CustomTooltip valueLabel={valueColumn} showCurrency={showCurrency} />}
                  cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RechartsPieChart>
                <Pie
                  data={chartData.slice(0, 10)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {chartData.slice(0, 10).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={<PieTooltip valueLabel={valueColumn} showCurrency={showCurrency} />}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
