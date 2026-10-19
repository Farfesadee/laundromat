'use client';
import type { ComponentType } from 'react';
import PhoneInput, { getCountryCallingCode } from 'react-phone-number-input';
import { isValidPhoneNumber } from 'react-phone-number-input';
import type { Country } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';

const DEFAULT_COUNTRY = ((process.env.NEXT_PUBLIC_DEFAULT_COUNTRY || 'NG').toUpperCase()) as Country;

type CountryOption = {
  value?: Country;
  label: string;
  divider?: boolean;
};

type CountrySelectProps = {
  value?: Country;
  onChange: (value?: Country) => void;
  options: CountryOption[];
  iconComponent: ComponentType<{ country?: Country; label?: string }>;
  disabled?: boolean;
  readOnly?: boolean;
  name?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  'aria-label'?: string;
};

/**
 * Country picker that keeps the dial code visible next to the flag.
 * The native select sits invisibly on top, so the whole segment stays clickable.
 */
function CountrySelect({
  value,
  onChange,
  options,
  iconComponent: FlagIcon,
  disabled = false,
  readOnly = false,
  ...rest
}: CountrySelectProps) {
  const selected = options.find((option) => option.value === value);

  return (
    <div className="phone-country">
      <select
        {...rest}
        className="phone-country-select"
        value={value || 'ZZ'}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === 'ZZ' ? undefined : (next as Country));
        }}
        disabled={disabled || readOnly}
      >
        {options.map((option) =>
          option.divider ? (
            <option key="divider" value="|" disabled>
              ----------
            </option>
          ) : (
            <option key={option.value || 'ZZ'} value={option.value || 'ZZ'}>
              {option.label}
              {option.value ? ` (+${getCountryCallingCode(option.value)})` : ''}
            </option>
          ),
        )}
      </select>
      <span className="phone-country-flag" aria-hidden="true">
        <FlagIcon country={value} label={selected?.label} />
      </span>
      <span className="phone-country-code">
        {value ? `+${getCountryCallingCode(value)}` : 'Country'}
      </span>
      <span className="phone-country-arrow" aria-hidden="true" />
    </div>
  );
}

type PhoneFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
};

export function PhoneField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  autoFocus = false,
  placeholder = 'Enter phone number',
  disabled = false,
  required = false,
}: PhoneFieldProps) {
  const describedBy = error || hint ? `${id}-help` : undefined;

  return (
    <div>
      <label htmlFor={id} className="label mb-1.5 block">
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <PhoneInput
        defaultCountry={DEFAULT_COUNTRY}
        countrySelectComponent={CountrySelect}
        flags={flags}
        value={value || undefined}
        onChange={(next) => onChange(next || '')}
        placeholder={placeholder}
        disabled={disabled}
        className={`phone-field ${error ? 'phone-field-error' : ''}`}
        numberInputProps={{
          id,
          autoComplete: 'tel',
          inputMode: 'tel',
          autoFocus,
          className: 'phone-field-input',
          'aria-invalid': Boolean(error),
          'aria-required': required,
          'aria-describedby': describedBy,
        }}
      />
      {error ? (
        <p id={`${id}-help`} className="mt-1.5 text-xs text-[#8d3f36]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-help`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { isValidPhoneNumber };
