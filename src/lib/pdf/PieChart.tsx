import { Circle, Path, Svg, Text, View } from '@react-pdf/renderer';
import type { Slice } from './stats';
import { PDF_FONT } from './fonts';

/** Distinct slice colors (teal-led, colour-blind-friendlyish), up to 5. */
const SLICE_COLORS = ['#0d6e64', '#e08a1e', '#3b74c4', '#8a4fbf', '#4f9d69'];

interface PieChartProps {
  title: string;
  slices: Slice[];
  size?: number;
}

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export default function PieChart({ title, slices, size = 96 }: PieChartProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  return (
    <View style={{ alignItems: 'center', width: 150 }}>
      <Text style={{ fontFamily: PDF_FONT, fontSize: 9, fontWeight: 600, color: '#16231f', marginBottom: 6 }}>
        {title}
      </Text>

      {total === 0 ? (
        <Text style={{ fontFamily: PDF_FONT, fontSize: 8, color: '#8a938f' }}>No data</Text>
      ) : (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.length === 1 ? (
            <Circle cx={cx} cy={cy} r={r} fill={SLICE_COLORS[0]} />
          ) : (
            slices.map((slice, i) => {
              const prior = slices.slice(0, i).reduce((s, x) => s + x.value, 0);
              const a0 = (prior / total) * 2 * Math.PI - Math.PI / 2;
              const a1 = ((prior + slice.value) / total) * 2 * Math.PI - Math.PI / 2;
              const [x0, y0] = polar(cx, cy, r, a0);
              const [x1, y1] = polar(cx, cy, r, a1);
              const largeArc = a1 - a0 > Math.PI ? 1 : 0;
              const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`;
              return <Path key={i} d={d} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />;
            })
          )}
        </Svg>
      )}

      <View style={{ marginTop: 6, width: '100%' }}>
        {slices.map((slice, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <View
              style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length], marginRight: 4 }}
            />
            <Text style={{ fontFamily: PDF_FONT, fontSize: 7.5, color: '#3c4746', flex: 1 }}>{slice.label}</Text>
            <Text style={{ fontFamily: PDF_FONT, fontSize: 7.5, color: '#16231f', fontWeight: 600 }}>
              {slice.value} ({Math.round((slice.value / total) * 100)}%)
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
