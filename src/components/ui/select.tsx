import { useState, useRef } from 'react';
import { ChevronDownIcon } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'default' | 'sm';
}

export function Select({ value, onChange, options, placeholder = '请选择', className = '', disabled = false, size = 'default' }: SelectProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const isSm = size === 'sm';

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between border rounded-md transition-colors ${
          isSm
            ? `px-1.5 py-0.5 text-xs gap-0.5 ${disabled ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : isOpen ? 'bg-white border-blue-400 ring-1 ring-blue-400' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'}`
            : `px-3 py-2 text-sm ${disabled ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : isOpen ? 'bg-white border-blue-400 ring-1 ring-blue-400' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'}`
        }`}
      >
        <span className={`flex items-center gap-1.5 ${selectedOption ? 'text-gray-700' : 'text-gray-400'}`}>
          {selectedOption?.icon}
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDownIcon className={`${isSm ? 'size-3' : 'size-4'} text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)}>
          <div 
            className={`absolute bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto ${isSm ? 'text-xs' : ''}`}
            style={{
              top: (buttonRef.current?.getBoundingClientRect().bottom || 0) + 4 + 'px',
              left: (buttonRef.current?.getBoundingClientRect().left || 0) + 'px',
              width: (buttonRef.current?.offsetWidth || 200) + 'px',
            }}
            onClick={e => e.stopPropagation()}
          >
            {options.length === 0 ? (
              <div className={`${isSm ? 'px-2 py-1.5' : 'px-3 py-2'} text-sm text-gray-400`}>无选项</div>
            ) : (
              options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left transition-colors ${
                    isSm ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
                  } ${
                    value === option.value
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {option.icon}
                    {option.label}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
