'use client';

import React, { useState, useEffect } from 'react';
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeftRight, Fan, Thermometer, Droplet } from 'lucide-react';
import { Toaster, toast } from 'sonner';

const adjustableComponents = ['천창1', '천창2', '차광1', '차광2', '보온1', '측커텐'];
const onOffComponents = ['유동팬', '송풍기'];
const percentages = ['OFF', '20%', '40%', '60%', '80%', '100%'];

const API_BASE_URL = 'http://163.180.105.108:5000/api';
// 인터페이스 정의
interface AdjustableState {
  value: string;
  type: string | null;
}

interface ComponentState {
  [key: string]: AdjustableState | boolean;
}

interface DailyUsage {
  [key: string]: { open: number; close: number };
}

// 그리고 타입 가드 함수 추가
function isAdjustableState(state: AdjustableState | boolean): state is AdjustableState {
  return typeof state === 'object' && state !== null && 'value' in state;
}

function isBoolean(value: AdjustableState | boolean): value is boolean {
  return typeof value === 'boolean';
}

export default function GreenhouseControl() {
  const [tempState, setTempState] = useState<ComponentState>({});
  const [controlState, setControlState] = useState<ComponentState>({});
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({});

  // 상태 업데이트 함수
  const fetchCurrentStatus = async () => {
    try {
        console.log('상태 조회 시작...');  // 디버깅 로그
        console.log('API 요청 시작:', `${API_BASE_URL}/status`);  // URL 확인
        
        const response = await fetch(`${API_BASE_URL}/status`, {
          method: 'GET',
          headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',  // CORS 헤더 추가
          },
          credentials: 'omit'  // CORS 관련 설정
        });
        console.log('응답 받음:', response.status, response.statusText);  // 응답 상태 로그
        
        if (!response.ok) {
          const errorBody = await response.text();
          console.error('응답 에러:', errorBody);
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }
        
        const data = await response.json();
        console.log('받은 데이터:', data);  // 받은 데이터 로그
        
        setControlState(data);
        console.log('상태 업데이트 완료');  // 상태 업데이트 로그
        
    } catch (error) {
        const errorMessage = error instanceof Error 
            ? error.message 
            : '알 수 없는 에러가 발생했습니다';
            
            console.error('상태 조회 실패:', {
              message: error instanceof Error ? error.message : String(error),
              url: `${API_BASE_URL}/status`,
              error: error
          });
        
        // 화면에 에러 메시지 표시
        toast.error(`상태 조회 실패: ${errorMessage}`);
    }
  };

  useEffect(() => {
    // 초기 상태 설정
    const initialState: ComponentState = {};
    adjustableComponents.forEach(component => {
      initialState[component] = { value: 'OFF', type: null };
    });
    onOffComponents.forEach(component => {
      initialState[component] = false;
    });
    setTempState(initialState);
    
    // 초기 상태 조회
    fetchCurrentStatus();
    
    // 30초마다 상태 업데이트
    const intervalId = setInterval(fetchCurrentStatus, 15000);
    
    // 컴포넌트 언마운트 시 인터벌 정리
    return () => clearInterval(intervalId);
  }, []);

  const handleAdjustableChange = (
    component: string, 
    action: string, 
    value: string
  ) => {
    // UI 상태만 업데이트
    setTempState((prevState: ComponentState) => ({
      ...prevState,
      [component]: {
        value: value,
        type: action
      }
    }));
  };

  const handleOnOffChange = (component: string) => {
    setTempState((prevState: ComponentState) => ({
      ...prevState,
      [component]: !prevState[component]
    }));
  };

  const handleConfirm = async () => {
    try {
        for (const component of adjustableComponents) {
            const state = tempState[component];
            if (isAdjustableState(state) && state.value !== 'OFF') {
                const response = await fetch(`${API_BASE_URL}/control`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        device: component,
                        action: state.type?.toLowerCase(),
                        percentage: state.value
                    }),
                });

                const data = await response.json();
                if (data.status === 'error') {
                    toast.error(`${component} 제어 실패: ${data.message}`);
                    continue;
                }
            }
        }

        // 제어 완료 후 즉시 상태 업데이트
        await fetchCurrentStatus();
        
        // tempState 초기화
        const initialState: ComponentState = {};
        adjustableComponents.forEach(component => {
            initialState[component] = { value: 'OFF', type: null };
        });
        onOffComponents.forEach(component => {
            initialState[component] = false;
        });
        setTempState(initialState);

        toast.success('모든 장치 제어가 완료되었습니다.');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러가 발생했습니다';
        toast.error(`제어 중 에러 발생: ${errorMessage}`);
    }
  };

  const handleReset = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('초기화 실패');
      }

      const data = await response.json();
      if (data.status === 'error') {
        toast.error(`초기화 실패: ${data.message}`);
        return;
      }

      // UI 상태 초기화
      const resetState: ComponentState = {};
      adjustableComponents.forEach(component => {
        resetState[component] = { value: 'OFF', type: null };
      });
      onOffComponents.forEach(component => {
        resetState[component] = false;
      });
      setTempState(resetState);
      setControlState(resetState);
      
      // 사용량도 초기화
      const resetUsage: DailyUsage = {};
      adjustableComponents.forEach(component => {
        resetUsage[component] = { open: 0, close: 0 };
      });
      setDailyUsage(resetUsage);

      toast.success('모든 장치가 초기화되었습니다.');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러가 발생했습니다';
      toast.error(`초기화 중 에러: ${errorMessage}`);
    }
  };

  const getIcon = (component: string) => {
    switch(component) {
      case '천창1':
      case '천창2':
        return <ArrowLeftRight className="w-4 h-4" />;
      case '차광1':
      case '차광2':
      case '보온1':
        return <Thermometer className="w-4 h-4" />;
      case '측커텐':
        return <Droplet className="w-4 h-4" />;
      case '유동팬':
      case '송풍기':
        return <Fan className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-8 bg-gray-50 min-h-screen">
      <Toaster position="top-center" richColors />
      <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">온실 환경 제어기</h1>
      
      <Tabs defaultValue="control" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="control" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700">제어 패널</TabsTrigger>
          <TabsTrigger value="usage" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700">일일 사용량</TabsTrigger>
        </TabsList>
        <TabsContent value="control">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {adjustableComponents.map(component => (
              <Card key={component} className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-gray-700">
                    {getIcon(component)}
                    <span>{component}</span>
                  </CardTitle>
                  <CardDescription>OPEN 또는 CLOSE 선택</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${component}-open`} className="text-blue-600">OPEN</Label>
                    <Select
                      value={
                        isAdjustableState(tempState[component]) && tempState[component].type === 'open' 
                          ? tempState[component].value 
                          : 'OFF'
                      }
                      onValueChange={(value) => handleAdjustableChange(component, 'open', value)}
                      disabled={
                        isAdjustableState(tempState[component]) && 
                        tempState[component].type === 'close' && 
                        tempState[component].value !== 'OFF'
                      }
                    >
                      <SelectTrigger id={`${component}-open`} className="border-gray-300 focus:ring-blue-500">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {percentages.map(percent => (
                          <SelectItem key={percent} value={percent}>{percent}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${component}-close`} className="text-red-600">CLOSE</Label>
                    <Select
                      value={
                        isAdjustableState(tempState[component]) && tempState[component].type === 'close' 
                          ? tempState[component].value 
                          : 'OFF'
                      }
                      onValueChange={(value) => handleAdjustableChange(component, 'close', value)}
                      disabled={
                        isAdjustableState(tempState[component]) && 
                        tempState[component].type === 'open' && 
                        tempState[component].value !== 'OFF'
                      }
                    >
                      <SelectTrigger id={`${component}-close`} className="border-gray-300 focus:ring-red-500">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {percentages.map(percent => (
                          <SelectItem key={percent} value={percent}>{percent}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}

            {onOffComponents.map(component => (
              <Card key={component} className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-gray-700">
                    {getIcon(component)}
                    <span>{component}</span>
                  </CardTitle>
                  <CardDescription>ON 또는 OFF 선택</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={isBoolean(tempState[component]) ? tempState[component] : false}
                      onCheckedChange={() => {
                        handleOnOffChange(component);
                      }}
                    />
                    <Label className={isBoolean(tempState[component]) && tempState[component] ? 'text-blue-600' : 'text-gray-500'}>
                      {isBoolean(tempState[component]) && tempState[component] ? 'ON' : 'OFF'}
                    </Label>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex justify-between items-center">
            <Button onClick={handleReset} variant="outline" size="lg" className="border-gray-300 text-gray-700 hover:bg-gray-100">
                초기화
            </Button>
            <Button onClick={handleConfirm} size="lg" className="bg-blue-500 hover:bg-blue-600 w-1/2 mx-auto">
                확인  
            </Button>
          </div>

        </TabsContent>
        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle className="text-gray-700">일일 사용량 ({new Date().toLocaleDateString()})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {adjustableComponents.map(component => (
                  <div key={component} className="flex flex-col p-4 bg-gray-100 rounded-lg">
                    <span className="font-bold text-lg mb-2 text-gray-800">{component}</span>
                    <span className="text-blue-600">OPEN: {dailyUsage[component]?.open || 0}%</span>
                    <span className="text-red-600">CLOSE: {dailyUsage[component]?.close || 0}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-gray-700">현재 제어 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {adjustableComponents.map(component => (
              <div key={component} className="flex flex-col p-4 bg-gray-100 rounded-lg">
                <span className="font-bold text-lg mb-2 text-gray-800">{component}</span>
                {isAdjustableState(controlState[component]) && (
                  <div className="flex flex-col">
                    <span className={
                      controlState[component].type === 'OPEN' ? 'text-blue-600' : 
                      controlState[component].type === 'CLOSE' ? 'text-red-600' : 
                      'text-gray-600'
                    }>
                      상태: {controlState[component].type || 'OFF'}
                    </span>
                    <span className="text-gray-600">
                      개도율: {controlState[component].value}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {onOffComponents.map(component => (
              <div key={component} className="flex justify-between items-center p-4 bg-gray-100 rounded-lg">
                <span className="font-bold text-lg text-gray-800">{component}</span>
                <span className={controlState[component] ? 'text-blue-600' : 'text-gray-600'}>
                  {controlState[component] ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

