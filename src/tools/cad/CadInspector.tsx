import { selectedFeature, type CadInspectorProps } from './cad-workspace-types';

function parameterInput(value: unknown): { type: 'number' | 'text' | 'unsupported'; display: string } {
  if (typeof value === 'number') return { type: 'number', display: String(value) };
  if (typeof value === 'string') return { type: 'text', display: value };
  return { type: 'unsupported', display: JSON.stringify(value) };
}

export default function CadInspector({ project, selection, onParameterChange }: CadInspectorProps) {
  const feature = selectedFeature(project, selection);

  if (!feature) {
    return <p className="cad-inspector-empty">Select a feature to inspect its parameters.</p>;
  }

  const parameterEntries = Object.entries(feature.parameters);

  return (
    <div className="cad-inspector" aria-label={`${feature.label} parameters`}>
      <h3 className="cad-inspector-title">{feature.label}</h3>
      <p className="cad-inspector-type">{feature.type}</p>
      {feature.diagnostic ? <p className="cad-inspector-diagnostic" role="alert">{feature.diagnostic}</p> : null}
      {parameterEntries.length === 0 ? (
        <p className="cad-inspector-empty">This feature has no editable parameters.</p>
      ) : (
        <dl className="cad-inspector-parameters">
          {parameterEntries.map(([key, value]) => {
            const field = parameterInput(value);
            return (
              <div className="cad-inspector-parameter" key={key}>
                <dt>
                  <label htmlFor={`cad-param-${feature.id}-${key}`}>{key}</label>
                </dt>
                <dd>
                  {field.type === 'unsupported' || key === 'kind' ? (
                    <span className="cad-inspector-parameter-readonly">{field.display}</span>
                  ) : (
                    <input
                      key={`${feature.id}-${key}-${field.display}`}
                      id={`cad-param-${feature.id}-${key}`}
                      type={field.type}
                      defaultValue={field.display}
                      onBlur={(event) => {
                        const raw = event.target.value;
                        onParameterChange(feature.id, key, field.type === 'number' ? Number(raw) : raw);
                      }}
                    />
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
