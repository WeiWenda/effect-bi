import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { authAPI, UserResponse } from '../services/api';

const { Title, Text } = Typography;

export default function Register(): JSX.Element {
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const handleSubmit = async (values: { username?: string; email: string; password: string }): Promise<void> => {
    setError('');
    setLoading(true);

    try {
      const response: UserResponse = await authAPI.register({ 
        email: values.email, 
        password: values.password, 
        username: values.username 
      });
      localStorage.setItem('token', response.token.access_token);
      localStorage.setItem('user', JSON.stringify({ id: response.id, email: response.email, username: response.username }));
      navigate('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md" title={
        <Title level={2} className="text-center mb-0">注册</Title>
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
            name="username"
            label="用户名（可选）"
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="输入用户名"
            />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="输入邮箱"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码长度至少为6位' },
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
              {loading ? '注册中...' : '注册'}
            </Button>
          </Form.Item>
        </Form>

        <Text className="block text-center mt-4">
          已有账号？
          <Button
            type="link"
            onClick={() => navigate('/login')}
            className="p-0 ml-1"
          >
            立即登录
          </Button>
        </Text>
      </Card>
    </div>
  );
}
