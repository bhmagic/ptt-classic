import { _ } from '../src/js/i18n.js';

export default function MouseSettings({ values, rightClickValue, rightClickOptions, onCloseClick, onTextInputChange, onCheckboxChange }) {
  return (
    <fieldset className="PrefModal__Grid__Col--right__Fieldset">
      <div className="TabLegend">
        <span className="TabLegend__Text">{_('options_mouse')}</span>
        <button type="button" className="close" onClick={onCloseClick} aria-label="Close">×</button>
      </div>
      <div className="PrefModal__TabBody">
        <div className="form-group">
          <label className="control-label" htmlFor="rightClickActionInput">{_('options_rightClickAction')}</label>
          <select id="rightClickActionInput" className="form-control" name="rightClickAction"
            value={rightClickValue} onChange={onTextInputChange}>
            {rightClickOptions}
          </select>
        </div>
        <div className="checkbox">
          <label>
            <input type="checkbox" name="trimTrailingSpaces" checked={values.trimTrailingSpaces ?? true}
              onChange={onCheckboxChange} />
            {_('options_trimTrailingSpaces')}
          </label>
        </div>
      </div>
    </fieldset>
  );
}
