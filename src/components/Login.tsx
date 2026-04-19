import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authAPI, TokenResponse } from '../services/api';

const { Title, Text } = Typography;

export default function Login(): JSX.Element {
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const handleSubmit = async (values: { email: string; password: string }): Promise<void> => {
    setError('');
    setLoading(true);

    try {
      const response: TokenResponse = await authAPI.login(values.email, values.password);
      localStorage.setItem('token', response.access_token);
      navigate('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md" title={
        <Title level={2} className="text-center mb-0">登录</Title>
      }>
        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            className="mb-4"
          />
        )}

        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
        >
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="输入邮箱"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="输入密码"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </Form.Item>
        </Form>

        <Text className="block text-center mt-4">
          还没有账号？
          <Button
            type="link"
            onClick={() => navigate('/register')}
            className="p-0 ml-1"
          >
            立即注册
          </Button>
        </Text>
      </Card>
    </div>
  );
}
