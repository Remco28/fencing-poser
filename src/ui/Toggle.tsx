export function Toggle<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
  /** Hide the label visually (it still names the group for screen readers). */
  bare?: boolean;
}) {
  return (
    <div className="toggle">
      {!props.bare && <span>{props.label}</span>}
      <div role="radiogroup" aria-label={props.label}>
        {props.options.map(([value, text]) => (
          <button
            key={value}
            role="radio"
            aria-checked={props.value === value}
            className={props.value === value ? 'on' : ''}
            onClick={() => props.onChange(value)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
