import { 
  ThreadPrimitive, 
  MessagePrimitive, 
  ComposerPrimitive, 
  MessagePartPrimitive 
} from '@assistant-ui/react';

export function Thread({ sessionId }: { sessionId: string }) {
  return (
    <ThreadPrimitive.Root className="h-full flex flex-col">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-4">
        <ThreadPrimitive.Messages>
          <ThreadPrimitive.MessageByIndex>
            <MessagePrimitive.Root>
              <MessagePrimitive.Parts>
                <MessagePartPrimitive.Text />
              </MessagePrimitive.Parts>
            </MessagePrimitive.Root>
          </ThreadPrimitive.MessageByIndex>
        </ThreadPrimitive.Messages>
        <ThreadPrimitive.Empty>
          <div className="text-center py-8">
            <p className="text-gray-500">欢迎使用聊天助手</p>
            <p className="text-gray-400 text-sm mt-2">开始新的对话，我可以帮助你解答问题。</p>
          </div>
        </ThreadPrimitive.Empty>
      </ThreadPrimitive.Viewport>
      <div className="p-4 border-t border-gray-200 bg-white">
        <ComposerPrimitive.Root>
          <ComposerPrimitive.Input placeholder="输入消息..." className="flex-1" />
          <ComposerPrimitive.Send />
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  );
}

export default Thread;
