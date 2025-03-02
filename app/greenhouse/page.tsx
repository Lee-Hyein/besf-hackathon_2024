'use client';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

import React, { useState, useEffect } from 'react';
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeftRight, Fan, Thermometer, Droplet, Settings } from 'lucide-react';
import { Toaster, toast } from 'sonner';

// ------------------
// 1. 상수 및 타입 정의
// ------------------
const adjustableComponents = ['천창1', '천창2', '차광1', '차광2', '보온1', '측커텐'];
const onOffComponents = ['유동팬', '송풍기'];
const percentages = ['OFF', '20%', '40%', '60%', '80%', '100%'];

const API_BASE_URL = 'http://163.180.105.108:5000/api';

interface SensorData {
  current: {
    temperature: number;
    humidity: number;
    co2: number;
    rain: number;
    solar_radiation: number;
  };
  history: {
    temperature: Array<{time: string; value: number}>;
    humidity: Array<{time: string; value: number}>;
    co2: Array<{time: string; value: number}>;
    rain: Array<{time: string; value: number}>;
    solar_radiation: Array<{time: string; value: number}>;
  };
}

interface AdjustableState {
  value: string;   // 'OFF' | '20%' | '40%' ...
  type: string | null;  // 'OPEN' | 'CLOSE' | null
}

interface ComponentState {
  [key: string]: AdjustableState | boolean | string;
}

// 타입 가드 함수
function isAdjustableState(
  state: AdjustableState | boolean | string
): state is AdjustableState {
  return typeof state === 'object' && state !== null && 'value' in state;
}

function isBoolean(
  value: AdjustableState | boolean | string
): value is boolean {
  return typeof value === 'boolean';
}

// ------------------
// 2. 메인 컴포넌트
// ------------------
export default function GreenhouseControl() {
  const [tempState, setTempState] = useState<ComponentState>({});
  const [controlState, setControlState] = useState<ComponentState>({});
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // ------------------
  // 2-1. 센서 데이터 조회
  // ------------------
  const fetchSensorData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/sensor-data`);
      if (!response.ok) {
        throw new Error('센서 데이터 조회 실패');
      }
      const data = await response.json();
      setSensorData(data);
    } catch (error) {
      console.error('센서 데이터 조회 중 오류:', error);
      toast.error('센서 데이터 조회 실패');
    }
  };

  useEffect(() => {
    fetchSensorData();
    const intervalId = setInterval(fetchSensorData, 15000);
    return () => clearInterval(intervalId);
  }, []);

  // ------------------
  // 2-2. 모바일 체크
  // ------------------
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // ------------------
  // 2-3. 서버에서 현재 장치 상태(status)만 -> controlState
  //      (주기적 폴링, operation-mode는 제외)
  // ------------------
  const fetchCurrentStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/status`);
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('응답 에러:', errorBody);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }

      const data = await response.json();
      setControlState(data);

      // ON/OFF 장치만 tempState와 동기화
      const updatedTempState = { ...tempState };
      onOffComponents.forEach(component => {
        if (typeof data[component] === 'boolean') {
          updatedTempState[component] = data[component];
        }
      });
      // OPEN/CLOSE는 여기서 덮어씌우지 않음 (항상 OFF 유지)

      setTempState(updatedTempState);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : '알 수 없는 에러가 발생했습니다';
      console.error('상태 조회 실패:', errorMessage);
      toast.error(`상태 조회 실패: ${errorMessage}`);
    }
  };

  useEffect(() => {
    // 장치 상태만 주기적으로 재조회
    fetchCurrentStatus();
    const intervalId = setInterval(fetchCurrentStatus, 15000);
    return () => clearInterval(intervalId);
  }, []);

  // ------------------
  // 2-4. tempState 초기화 + 운영 모드 처음에만 가져오기
  // ------------------
  useEffect(() => {
    // (1) tempState 초기화
    const initialState: ComponentState = {};
    adjustableComponents.forEach(component => {
      initialState[component] = { value: 'OFF', type: null };
    });
    onOffComponents.forEach(component => {
      initialState[component] = false;
    });
    // 우선 AUTO로 가정
    initialState['자동제어'] = 'AUTO';
    setTempState(initialState);

    // (2) 서버에서 operation-mode 한 번만 불러오기
    fetch(`${API_BASE_URL}/operation-mode`)
      .then(res => res.json())
      .then(data => {
        setTempState(prev => ({
          ...prev,
          '자동제어': data.mode === 0 ? 'AUTO' : 'MANUAL'
        }));
      })
      .catch(err => {
        console.error('운영 모드 조회 실패:', err);
        toast.error('운영 모드 조회 실패');
      });
  }, []);

  // ------------------
  // 3. OPEN/CLOSE 선택
  // ------------------
  const handleAdjustableChange = (
    component: string, 
    action: string, 
    value: string
  ) => {
    setTempState(prev => ({
      ...prev,
      [component]: {
        value: value,
        type: value === 'OFF' ? null : action.toUpperCase()
      }
    }));
  };

  // ------------------
  // 4. ON/OFF 스위치
  // ------------------
  const handleOnOffChange = (component: string) => {
    setTempState(prev => ({
      ...prev,
      [component]: !prev[component]
    }));
  };

  // ------------------
  // 5. 확인 버튼
  // ------------------
  const handleConfirm = async () => {
    try {
      for (const component of [...adjustableComponents, ...onOffComponents]) {
        const state = tempState[component];
        const currentState = controlState[component];

        // ON/OFF 장치
        if (isBoolean(state) && isBoolean(currentState)) {
          if (state !== currentState) {
            const response = await fetch(`${API_BASE_URL}/control`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                device: component,
                action: state ? 'on' : 'off'
              })
            });
            const data = await response.json();
            if (data.status === 'error') {
              toast.error(`${component} 제어 실패: ${data.message}`);
              continue;
            }
          }
        }
        // OPEN/CLOSE 장치
        else if (isAdjustableState(state) && state.value !== 'OFF') {
          const currentValue = isAdjustableState(currentState) 
            ? currentState.value 
            : 'OFF';
          const currentType = isAdjustableState(currentState)
            ? currentState.type
            : null;

          if (state.value !== currentValue || state.type !== currentType) {
            const response = await fetch(`${API_BASE_URL}/control`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                device: component,
                action: state.type?.toLowerCase(),
                percentage: state.value
              })
            });
            const data = await response.json();
            if (data.status === 'error') {
              toast.error(`${component} 제어 실패: ${data.message}`);
              continue;
            }
          }
        }
      }

      // 제어 후 상태 다시 조회
      await fetchCurrentStatus();

      // 다시 OFF로 초기화(ON/OFF는 false, 자동제어는 그대로)
      const resetState: ComponentState = {};
      adjustableComponents.forEach(component => {
        resetState[component] = { value: 'OFF', type: null };
      });
      onOffComponents.forEach(component => {
        resetState[component] = false;
      });
      resetState['자동제어'] = tempState['자동제어'];
      setTempState(resetState);

      toast.success('모든 장치 제어가 완료되었습니다.');
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message
        : '알 수 없는 에러가 발생했습니다';
      toast.error(`제어 중 에러 발생: ${errorMessage}`);
    }
  };

  // ------------------
  // 6. 초기화 버튼
  // ------------------
  const handleReset = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('초기화 실패');
      }

      const data = await response.json();
      if (data.status === 'error') {
        toast.error(`초기화 실패: ${data.message}`);
        return;
      }

      // UI 상태 초기화 (자동제어는 그대로)
      const resetState: ComponentState = {};
      adjustableComponents.forEach(component => {
        resetState[component] = { value: 'OFF', type: null };
      });
      onOffComponents.forEach(component => {
        resetState[component] = false;
      });
      resetState['자동제어'] = tempState['자동제어'];

      setTempState(resetState);
      setControlState(resetState);

      toast.success('모든 장치가 초기화되었습니다.');
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message
        : '알 수 없는 에러가 발생했습니다';
      toast.error(`초기화 중 에러: ${errorMessage}`);
    }
  };

  // ------------------
  // 7. AUTO/MANUAL 스위치 토글
  // ------------------
  const handleAutoControlChange = async () => {
    try {
      // AUTO면 1, MANUAL이면 0이라 가정
      const newMode = tempState['자동제어'] === 'AUTO' ? 1 : 0;
      const response = await fetch(`${API_BASE_URL}/operation-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode })
      });
      if (!response.ok) {
        throw new Error('운영 모드 변경 실패');
      }
      const data = await response.json();
      if (data.status === 'success') {
        // ★ 서버 응답에 상관없이, 프런트는 사용자가 선택한 모드로 tempState 반영
        setTempState(prev => ({
          ...prev,
          '자동제어': newMode === 0 ? 'AUTO' : 'MANUAL'
        }));
        toast.success(`운영 모드가 ${newMode === 0 ? 'AUTO' : 'MANUAL'}로 변경되었습니다.`);
      } else {
        // 서버 오류 시
        throw new Error(data.message || '운영 모드 변경 실패');
      }
    } catch (error) {
      console.error(error);
      toast.error('운영 모드 변경 실패');
    }
  };

  // ------------------
  // 8. 아이콘 표시
  // ------------------
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

  // ------------------
  // 9. 렌더링
  // ------------------
  return (
    <div className="container mx-auto p-4 space-y-8 bg-gray-50 min-h-screen">
      <Toaster position="top-center" richColors />

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">온실 환경 제어기</h1>
        <div className="flex items-center space-x-3 bg-white p-3 rounded-lg shadow">
          <Settings className="w-5 h-5 text-gray-600" />
          <Label className="text-gray-700 font-medium">제어모드</Label>
          {/* ★ 스위치: AUTO↔MANUAL 토글 */}
          <Switch
            checked={tempState['자동제어'] === 'MANUAL'}
            onCheckedChange={handleAutoControlChange}
            aria-label="자동제어 모드 전환"
          />
          <Label
            className={
              tempState['자동제어'] === 'MANUAL'
                ? 'text-blue-600 font-medium min-w-[60px]'
                : 'text-gray-500 font-medium min-w-[60px]'
            }
          >
            {tempState['자동제어']}
          </Label>
        </div>
      </div>

      {/* 탭 */}
      <Tabs defaultValue="control" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger
            value="control"
            className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700"
          >
            제어 패널
          </TabsTrigger>
          <TabsTrigger
            value="sensor"
            className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700"
          >
            센서 데이터
          </TabsTrigger>
        </TabsList>

        {/* 제어 패널 탭 */}
        <TabsContent value="control">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* OPEN/CLOSE 장치 */}
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
                  {/* OPEN Select */}
                  <div className="space-y-2">
                    <Label htmlFor={`${component}-open`} className="text-blue-600">
                      OPEN
                    </Label>
                    <Select
                      value={
                        isAdjustableState(tempState[component]) &&
                        tempState[component].type === 'OPEN'
                          ? tempState[component].value
                          : 'OFF'
                      }
                      onValueChange={(value) => handleAdjustableChange(component, 'OPEN', value)}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {isAdjustableState(tempState[component]) && tempState[component].type === 'OPEN'
                            ? tempState[component].value
                            : 'OFF'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {percentages.map(percent => (
                          <SelectItem
                            key={percent}
                            value={percent}
                            // CLOSE가 선택된 상태(OFF가 아님)라면 OPEN 비활성화
                            disabled={
                              isAdjustableState(tempState[component]) &&
                              tempState[component].type === 'CLOSE' &&
                              tempState[component].value !== 'OFF'
                            }
                          >
                            {percent}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* CLOSE Select */}
                  <div className="space-y-2">
                    <Label htmlFor={`${component}-close`} className="text-red-600">
                      CLOSE
                    </Label>
                    <Select
                      value={
                        isAdjustableState(tempState[component]) &&
                        tempState[component].type === 'CLOSE'
                          ? tempState[component].value
                          : 'OFF'
                      }
                      onValueChange={(value) => handleAdjustableChange(component, 'CLOSE', value)}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {isAdjustableState(tempState[component]) && tempState[component].type === 'CLOSE'
                            ? tempState[component].value
                            : 'OFF'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {percentages.map(percent => (
                          <SelectItem
                            key={percent}
                            value={percent}
                            // OPEN이 선택된 상태(OFF가 아님)라면 CLOSE 비활성화
                            disabled={
                              isAdjustableState(tempState[component]) &&
                              tempState[component].type === 'OPEN' &&
                              tempState[component].value !== 'OFF'
                            }
                          >
                            {percent}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* ON/OFF 장치 */}
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
                      checked={
                        isBoolean(tempState[component])
                          ? tempState[component]
                          : false
                      }
                      onCheckedChange={() => handleOnOffChange(component)}
                    />
                    <Label
                      className={
                        isBoolean(tempState[component]) && tempState[component]
                          ? 'text-blue-600'
                          : 'text-gray-500'
                      }
                    >
                      {isBoolean(tempState[component]) && tempState[component]
                        ? 'ON'
                        : 'OFF'}
                    </Label>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 확인/초기화 버튼 */}
          <div className="mt-8 flex justify-between items-center">
            <Button
              onClick={handleReset}
              // ★ AUTO 모드면 비활성화
              disabled={tempState['자동제어'] === 'AUTO'}
              variant="outline"
              size="lg"
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              초기화
            </Button>
            <Button
              onClick={handleConfirm}
              // ★ AUTO 모드면 비활성화
              disabled={tempState['자동제어'] === 'AUTO'}
              size="lg"
              className="bg-blue-500 hover:bg-blue-600 w-1/2 mx-auto"
            >
              확인
            </Button>
          </div>
        </TabsContent>

        {/* 센서 데이터 탭 */}
        <TabsContent value="sensor">
          <div className="space-y-4">
            {/* 현재 센서 데이터 */}
            <Card>
              <CardHeader>
                <CardTitle>현재 센서 데이터</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="p-2 bg-blue-50 rounded-md">
                    <div className="font-semibold text-gray-700 text-center">온도</div>
                    <div className="text-2md text-center">
                      {sensorData?.current.temperature.toFixed(1)}°C
                    </div>
                  </div>
                  <div className="p-2 bg-green-50 rounded-md">
                    <div className="font-semibold text-gray-700 text-center">습도</div>
                    <div className="text-2md text-center">
                      {sensorData?.current.humidity.toFixed(1)}%
                    </div>
                  </div>
                  <div className="p-2 bg-purple-50 rounded-md">
                    <div className="font-semibold text-gray-700 text-center">CO2</div>
                    <div className="text-2md text-center">
                      {sensorData?.current.co2.toFixed(1)}ppm
                    </div>
                  </div>
                  <div className="p-2 bg-red-50 rounded-md">
                    <div className="font-semibold text-gray-700 text-center">강우</div>
                    <div className="text-2md text-center">
                      {sensorData?.current.rain ? '감지' : '미감지'}
                    </div>
                  </div>
                  <div className="p-2 bg-yellow-50 rounded-md">
                    <div className="font-semibold text-gray-700 text-center">일사량</div>
                    <div className="text-2md text-center">
                      {sensorData?.current.solar_radiation.toFixed(1)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 24시간 센서 데이터 */}
            <Card>
              <CardHeader>
                <CardTitle>24시간 센서 데이터</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full min-h-[300px] h-[50vh] max-h-[400px] px-0 sm:px-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(time) => new Date(time).toLocaleTimeString()}
                        allowDuplicatedCategory={false}
                        interval="preserveStartEnd"
                        angle={-45}
                        textAnchor="end"
                        height={50}
                        style={{ fontSize: '0.75rem' }}
                      />
                      <YAxis
                        yAxisId="temperature"
                        domain={[0,40]}
                        tickFormatter={(v) => `${v}°C`}
                        stroke="#2563eb"
                        style={{ fontSize: '0.7rem' }}
                        tickCount={5}
                        width={40}
                      />
                      <YAxis
                        yAxisId="humidity"
                        domain={[0,100]}
                        tickFormatter={(v) => `${v}%`}
                        stroke="#16a34a"
                        style={{ fontSize: '0.7rem' }}
                        tickCount={5}
                        width={40}
                      />
                      <YAxis
                        yAxisId="co2"
                        domain={[0,700]}
                        tickFormatter={(v) => `${v}ppm`}
                        stroke="#D840F6"
                        tickCount={10}
                        style={{ fontSize: '0.7rem' }}
                        width={55}
                      />
                      <YAxis
                        yAxisId="solar_radiation"
                        domain={[0,700]}
                        tickFormatter={(v) => `${v}`}
                        stroke="#f59e0b"
                        tickCount={10}
                        style={{ fontSize: '0.7rem' }}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          if (name === "온도") return `${value}°C`;
                          if (name === "습도") return `${value}%`;
                          if (name === "CO2") return `${value}ppm`;
                          if (name === "일사량") return `${value}`;
                          return value;
                        }}
                        contentStyle={{
                          fontSize: '0.8rem',
                          padding: '8px',
                          backgroundColor: 'rgba(255, 255, 255, 0.9)'
                        }}
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: '0.8rem',
                          paddingTop: '10px'
                        }}
                        layout={isMobile ? 'horizontal' : 'vertical'}
                        verticalAlign="bottom"
                        align="center"
                      />
                      <Line
                        data={sensorData?.history.temperature}
                        type="monotone"
                        dataKey="value"
                        name="온도"
                        stroke="#2563eb"
                        yAxisId="temperature"
                        dot={false}
                      />
                      <Line
                        data={sensorData?.history.humidity}
                        type="monotone"
                        dataKey="value"
                        name="습도"
                        stroke="#16a34a"
                        yAxisId="humidity"
                        dot={false}
                      />
                      <Line
                        data={sensorData?.history.co2}
                        type="monotone"
                        dataKey="value"
                        name="CO2"
                        stroke="#D840F6"
                        yAxisId="co2"
                        dot={false}
                      />
                      <Line
                        data={sensorData?.history.solar_radiation}
                        type="monotone"
                        dataKey="value"
                        name="일사량"
                        stroke="#f59e0b"
                        yAxisId="solar_radiation"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* 현재 제어 상태 (서버 상태) */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-gray-700">현재 제어 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {adjustableComponents.map(component => (
              <div 
                key={component}
                className="flex flex-col p-4 bg-gray-100 rounded-lg"
              >
                <span className="font-bold text-lg mb-2 text-gray-800">{component}</span>
                {isAdjustableState(controlState[component]) && (
                  <div className="flex flex-col">
                    <span
                      className={
                        controlState[component].type === 'OPEN'
                          ? 'text-blue-600'
                          : controlState[component].type === 'CLOSE'
                          ? 'text-red-600'
                          : 'text-gray-600'
                      }
                    >
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
              <div
                key={component}
                className="flex justify-between items-center p-4 bg-gray-100 rounded-lg"
              >
                <span className="font-bold text-lg text-gray-800">{component}</span>
                <span
                  className={
                    controlState[component] ? 'text-blue-600' : 'text-gray-600'
                  }
                >
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
