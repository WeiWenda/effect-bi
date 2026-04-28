import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { JoinType } from './CubeCanvas';

interface JoinConditionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (leftField: string, rightField: string, joinType: JoinType) => void;
  leftTableName: string;
  rightTableName: string;
  leftFields: string[];
  rightFields: string[];
  initialLeftField?: string;
  initialRightField?: string;
  initialJoinType?: JoinType;
}

export function JoinConditionDialog({
  open,
  onClose,
  onConfirm,
  leftTableName,
  rightTableName,
  leftFields,
  rightFields,
  initialLeftField = '',
  initialRightField = '',
  initialJoinType = 'inner',
}: JoinConditionDialogProps): React.JSX.Element {
  const [leftField, setLeftField] = useState(initialLeftField);
  const [rightField, setRightField] = useState(initialRightField);
  const [joinType, setJoinType] = useState<JoinType>(initialJoinType);
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setLeftField(initialLeftField);
      setRightField(initialRightField);
      setJoinType(initialJoinType);
      setLeftSearch('');
      setRightSearch('');
    }
  }, [open, initialLeftField, initialRightField, initialJoinType]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (leftRef.current && !leftRef.current.contains(e.target as Node)) {
        setLeftOpen(false);
      }
      if (rightRef.current && !rightRef.current.contains(e.target as Node)) {
        setRightOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredLeftFields = leftFields.filter(f =>
    f.toLowerCase().includes(leftSearch.toLowerCase())
  );
  const filteredRightFields = rightFields.filter(f =>
    f.toLowerCase().includes(rightSearch.toLowerCase())
  );

  const handleConfirm = () => {
    if (leftField && rightField) {
      onConfirm(leftField, rightField, joinType);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置连接条件</DialogTitle>
        </DialogHeader>

        {/* Hidden element to prevent auto-focus */}
        <div className="sr-only">
          <input type="text" autoFocus />
        </div>

        {/* Join Type Toggle */}
        <div className="flex items-center gap-3 py-2">
          <span className="text-xs font-medium text-gray-500">连接类型</span>
          <div className="inline-flex rounded-md shadow-sm">
            <button
              type="button"
              onClick={() => setJoinType('inner')}
              className={`rounded-l-md px-3 py-1 text-xs font-medium transition-colors ${joinType === 'inner' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              INNER
            </button>
            <button
              type="button"
              onClick={() => setJoinType('full')}
              className={`-ml-px rounded-r-md px-3 py-1 text-xs font-medium transition-colors ${joinType === 'full' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              FULL
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 py-4">
          {/* Left dropdown */}
          <div className="flex-1" ref={leftRef}>
            <label className="text-xs font-medium text-gray-500 mb-1 block">{leftTableName}</label>
            <div className="relative">
              <input
                type="text"
                value={leftOpen ? leftSearch : leftField}
                onChange={e => {
                  setLeftSearch(e.target.value);
                  if (!leftOpen) setLeftOpen(true);
                  if (leftField) setLeftField('');
                }}
                onFocus={() => {
                  setLeftSearch('');
                  setLeftOpen(true);
                }}
                placeholder="搜索或输入字段..."
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              {leftOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                  {filteredLeftFields.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">无匹配字段</div>
                  ) : (
                    filteredLeftFields.map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setLeftField(f);
                          setLeftSearch('');
                          setLeftOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-600 transition-colors"
                      >
                        {f}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <span className="text-gray-400 font-medium mt-5">=</span>

          {/* Right dropdown */}
          <div className="flex-1" ref={rightRef}>
            <label className="text-xs font-medium text-gray-500 mb-1 block">{rightTableName}</label>
            <div className="relative">
              <input
                type="text"
                value={rightOpen ? rightSearch : rightField}
                onChange={e => {
                  setRightSearch(e.target.value);
                  if (!rightOpen) setRightOpen(true);
                  if (rightField) setRightField('');
                }}
                onFocus={() => {
                  setRightSearch('');
                  setRightOpen(true);
                }}
                placeholder="搜索或输入字段..."
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              />
              {rightOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                  {filteredRightFields.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">无匹配字段</div>
                  ) : (
                    filteredRightFields.map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setRightField(f);
                          setRightSearch('');
                          setRightOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-600 transition-colors"
                      >
                        {f}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleConfirm} disabled={!leftField || !rightField}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
