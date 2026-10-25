// The trust chips: a shape, the age, and the longer words on hover and focus.
// Text nodes only (SEC-2).
import { useId } from 'react';
import type { ChipModel } from '../model/chips';
import { ChipShapeIcon } from './Icons';

function ChipView({ chip }: { chip: ChipModel }) {
  const tip = useId();
  const name = [chip.label, chip.value, chip.flag === null ? chip.shapeWord : chip.flag].filter((x) => x !== null && x !== '').join(', ');
  return (
    <span className={`chip tone-${chip.tone}`} tabIndex={0} role="group" aria-label={chip.id === 'plan' ? `Plan recalculated ${chip.value ?? ''}` : name} aria-describedby={tip} data-testid={`chip-${chip.id}`} data-shape={chip.shape}>
      <ChipShapeIcon shape={chip.shape} />
      {chip.label === '' ? null : <span>{chip.label}</span>}
      {chip.value === null ? null : <b>{chip.value}</b>}
      {chip.flag === null ? null : <span className="flag">{chip.flag}</span>}
      <span className="pop" role="tooltip" id={tip}>
        {chip.tip}
      </span>
    </span>
  );
}

export function Chips({ chips }: { chips: readonly ChipModel[] }) {
  return (
    <>
      {chips.map((c) => (
        <ChipView key={c.id} chip={c} />
      ))}
    </>
  );
}
